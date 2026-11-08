-- MediFinder India: atomic customer COD checkout.
create schema if not exists mf_private authorization postgres;
revoke all on schema mf_private from public,anon;
grant usage on schema mf_private to authenticated;
create unique index if not exists idx_orders_order_id_unique on public.orders(order_id) where order_id is not null;
CREATE OR REPLACE FUNCTION mf_private.create_customer_cod_order_internal(p_items jsonb, p_customer_name text, p_customer_phone text, p_address1 text, p_address2 text, p_landmark text, p_city text, p_state text, p_pincode text, p_patient_name text DEFAULT NULL::text, p_prescription_path text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_user_lat numeric DEFAULT NULL::numeric, p_user_lon numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_order_id text := 'MF-' || upper(replace(v_request_id::text, '-', ''));
  v_item record;
  v_med record;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_shipping_fee numeric(12,2) := 0;
  v_platform_fee numeric(12,2) := 0;
  v_processing_fee numeric(12,2) := 0;
  v_cod_fee numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;
  v_has_rx boolean := false;
  v_item_count integer := 0;
  v_primary_merchant_id bigint := null;
  v_items_text text := '';
  v_items_img text := '';
  v_full_address text;
  v_existing public.orders%rowtype;
  v_inserted public.orders%rowtype;
  v_secure_code text;
  v_prescription_order_id uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in before placing an order.' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Your cart is empty or contains too many different products.' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_customer_name)),0) < 2
     or coalesce(p_customer_phone,'') !~ '^[6-9][0-9]{9}$'
     or coalesce(length(btrim(p_address1)),0) < 4
     or coalesce(length(btrim(p_city)),0) < 2
     or coalesce(p_pincode,'') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid name, Indian mobile number and complete delivery address.' using errcode = '22023';
  end if;

  select * into v_existing from public.orders
  where order_id = v_order_id and user_id = v_uid::text limit 1;
  if found then
    return jsonb_build_object('success',true,'already_processed',true,
      'order_id',v_existing.order_id,'status',v_existing.status,'total_amount',v_existing.total_amount);
  end if;

  v_full_address := concat_ws(', ',nullif(btrim(p_address1),''),nullif(btrim(p_address2),''),
    nullif(btrim(p_landmark),''),nullif(btrim(p_city),''),nullif(btrim(p_state),''),nullif(btrim(p_pincode),''));

  select greatest(0,coalesce(z.base_fee,0)) into v_delivery_fee
  from public.service_zones z
  where (z.pin=p_pincode or z.pincode=p_pincode)
    and lower(coalesce(z.status,''))='approved'
    and coalesce(z.is_active,true)=true
  order by z.created_at desc nulls last
  limit 1;
  if not found then
    raise exception 'This PIN code is not in an active approved MediFinder delivery zone.' using errcode = 'P0001';
  end if;

  for v_item in
    select x.medicine_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(medicine_id bigint, quantity integer)
    group by x.medicine_id order by x.medicine_id
  loop
    if v_item.medicine_id is null or v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 20 then
      raise exception 'A cart item has an invalid product ID or quantity.' using errcode = '22023';
    end if;

    select m.*,case when coalesce(m.selling_price,0)>0 then m.selling_price
      when coalesce(m.unit_price,0)>0 then m.unit_price else coalesce(m.mrp,0) end as checkout_price
    into v_med from public.medicines m where m.id=v_item.medicine_id for update;

    if not found then raise exception 'A product in your cart is no longer listed.' using errcode = 'P0001'; end if;
    if lower(coalesce(v_med.status,'')) not in ('approved','active') or coalesce(v_med.is_visible,true)=false then
      raise exception '% is not available for purchase right now.',coalesce(v_med.product_name,v_med.name,'This product') using errcode = 'P0001';
    end if;
    if v_med.merchant_id is null
       or not coalesce(public.merchant_is_verified(v_med.merchant_id),false)
       or not coalesce(public.merchant_may_show_type(v_med.merchant_id,v_med.product_type),false) then
      raise exception 'The seller for % is not currently verified to fulfil this product.',coalesce(v_med.product_name,v_med.name,'a cart item') using errcode = 'P0001';
    end if;
    if exists(select 1 from public.merchants m where m.id=v_med.merchant_id and lower(coalesce(m.status,''))='suspended') then
      raise exception 'The seller for % is not accepting orders.',coalesce(v_med.product_name,v_med.name,'this product') using errcode = 'P0001';
    end if;
    if coalesce(v_med.stock_qty,0)<v_item.quantity then
      raise exception 'Insufficient stock for %. Available: %, requested: %.',coalesce(v_med.product_name,v_med.name,'This product'),coalesce(v_med.stock_qty,0),v_item.quantity using errcode = 'P0001';
    end if;
    if coalesce(v_med.checkout_price,0)<=0 then
      raise exception 'A valid current price is unavailable for %.',coalesce(v_med.product_name,v_med.name,'this product') using errcode = 'P0001';
    end if;
    if coalesce(v_med.is_rx,false) or lower(coalesce(v_med.prescription_req,''))='yes' then
      v_has_rx:=true;
      if not coalesce(public.merchant_can_sell_rx(v_med.merchant_id),false) then
        raise exception 'The seller is not authorised to fulfil prescription medicines.' using errcode = 'P0001';
      end if;
    end if;

    v_line:=jsonb_build_object(
      'medicine_id',v_med.id,'product_name',coalesce(nullif(v_med.product_name,''),v_med.name,'Healthcare product'),
      'product_image',coalesce(v_med.image_url,''),'quantity',v_item.quantity,'unit_price',v_med.checkout_price,
      'total_price',round(v_med.checkout_price*v_item.quantity,2),'merchant_id',v_med.merchant_id,
      'mrp',coalesce(v_med.mrp,v_med.checkout_price),'manufacturer',coalesce(v_med.manufacturer,v_med.brand_name),
      'batch_number',coalesce(v_med.batch_number,v_med.lot_number),'expiry_date',v_med.expiry_date,
      'hsn_code',v_med.hsn_code,'gst_rate',v_med.gst_rate
    );
    v_lines:=v_lines||jsonb_build_array(v_line);
    v_subtotal:=v_subtotal+round(v_med.checkout_price*v_item.quantity,2);
    v_item_count:=v_item_count+1;
    if v_primary_merchant_id is null then v_primary_merchant_id:=v_med.merchant_id; end if;
    if v_items_img='' then v_items_img:=coalesce(v_med.image_url,''); end if;
    v_items_text:=concat_ws(', ',nullif(v_items_text,''),coalesce(nullif(v_med.product_name,''),v_med.name,'Product')||' × '||v_item.quantity::text);
  end loop;

  if v_item_count<1 then raise exception 'No valid products were found in your cart.' using errcode = '22023'; end if;
  if v_has_rx then
    if coalesce(p_prescription_path,'')='' or p_prescription_path not like v_uid::text||'/%' then
      raise exception 'A prescription upload linked to your account is required for this cart.' using errcode = 'P0001';
    end if;
    select po.id into v_prescription_order_id
    from storage.objects so
    join public.prescription_orders po on po.prescription_url=so.name and po.user_id=v_uid
    where so.bucket_id='customer-prescriptions' and so.name=p_prescription_path
      and po.status in ('pending','Pending','accepted','Accepted')
    limit 1;
    if not found then
      raise exception 'The selected prescription could not be verified for this account. Please upload it again.' using errcode = 'P0001';
    end if;
  end if;

  -- Delivery fee comes only from the admin-configured approved service-zone base_fee.
  -- Shipping, platform, processing and COD surcharges remain zero until separately configured.
  v_grand_total:=round(v_subtotal+v_delivery_fee+v_shipping_fee+v_platform_fee+v_processing_fee+v_cod_fee,2);
  v_secure_code:=lpad((floor(random()*1000000))::integer::text,6,'0');

  begin
    insert into public.orders(
      order_id,user_id,user_email,customer_id,customer_name,customer_phone,customer_address,customer_email,user_name,user_phone,
      items,items_text,items_img,address,delivery_address,payment_mode,payment_method,total_bill,total_amount,total,final_amount,
      delivery_fee,delivery_charge,shipping_fee,platform_fee,processing_fee,cod_fee,tax,discount,payment_status,
      payment_verification_status,status,rx_verified,prescription_verified,prescription_required,rx_prescription_url,prescription_url,
      delivery_speed,delivery_partner,eta_minutes,transit_mode,delivery_secure_code,notes,user_lat,user_lon,merchant_id
    ) values(
      v_order_id,v_uid::text,v_email,v_uid,btrim(p_customer_name),p_customer_phone,v_full_address,v_email,btrim(p_customer_name),p_customer_phone,
      v_lines,v_items_text,v_items_img,v_full_address,v_full_address,'COD','COD','₹'||to_char(v_grand_total,'FM999999990.00'),
      v_grand_total,v_subtotal,v_grand_total,v_delivery_fee,v_delivery_fee,v_shipping_fee,v_platform_fee,v_processing_fee,v_cod_fee,0,0,
      'Pending',null,'pending',false,false,v_has_rx,case when v_has_rx then p_prescription_path else null end,
      case when v_has_rx then p_prescription_path else null end,'manual','medifinder',30,'Bike',v_secure_code,
      case when coalesce(btrim(p_patient_name),'')<>'' then 'Patient: '||btrim(p_patient_name) else null end,
      p_user_lat,p_user_lon,v_primary_merchant_id
    ) returning * into v_inserted;

    for v_line in select value from jsonb_array_elements(v_lines) loop
      insert into public.order_items(
        order_id,medicine_id,merchant_id,product_name,product_image,quantity,unit_price,total_price,status,name,price,mrp,image_url,total,
        manufacturer,batch_number,expiry_date,hsn_code,gst_rate
      ) values(
        v_order_id,(v_line->>'medicine_id')::bigint,(v_line->>'merchant_id')::bigint,v_line->>'product_name',
        coalesce(v_line->>'product_image',''),(v_line->>'quantity')::integer,(v_line->>'unit_price')::numeric,
        (v_line->>'total_price')::numeric,'active',v_line->>'product_name',(v_line->>'unit_price')::numeric,
        (v_line->>'mrp')::numeric,coalesce(v_line->>'product_image',''),(v_line->>'total_price')::numeric,
        nullif(v_line->>'manufacturer',''),nullif(v_line->>'batch_number',''),coalesce(v_line->>'expiry_date',''),
        nullif(v_line->>'hsn_code',''),nullif(v_line->>'gst_rate','')::numeric
      );
    end loop;

    for v_item in
      select x.medicine_id,sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_items) as x(medicine_id bigint,quantity integer)
      group by x.medicine_id order by x.medicine_id
    loop
      update public.medicines set stock_qty=stock_qty-v_item.quantity
      where id=v_item.medicine_id and coalesce(stock_qty,0)>=v_item.quantity;
      if not found then raise exception 'Stock changed while your order was being placed. Please retry.' using errcode = 'P0001'; end if;
    end loop;

    -- Notify every distinct seller in a multi-merchant cart; the existing
    -- notification trigger also sends the seller's configured push alert.
    insert into public.merchant_notifications(
      merchant_id,title,message,type,category,is_read,reference_id,reference_type,action_url,related_prescription_id
    )
    select distinct
      (line.value->>'merchant_id')::bigint,
      'New COD Order Received',
      'Order '||v_order_id||' from '||btrim(p_customer_name)||'. Items: '||v_items_text||
        '. Total: ₹'||to_char(v_grand_total,'FM999999990.00')||'. Address: '||v_full_address,
      'info','order',false,v_inserted.id,'order',
      'marchentorders.html?order_id='||v_order_id,v_prescription_order_id
    from jsonb_array_elements(v_lines) as line(value)
    where (line.value->>'merchant_id')::bigint <> v_primary_merchant_id;

    return jsonb_build_object('success',true,'already_processed',false,'order_id',v_order_id,'status','pending',
      'payment_method','COD','subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'shipping_fee',v_shipping_fee,
      'platform_fee',v_platform_fee,'processing_fee',v_processing_fee,'cod_fee',v_cod_fee,'total_amount',v_grand_total,
      'prescription_required',v_has_rx);
  exception when unique_violation then
    select * into v_existing from public.orders where order_id=v_order_id and user_id=v_uid::text limit 1;
    if found then return jsonb_build_object('success',true,'already_processed',true,'order_id',v_existing.order_id,
      'status',v_existing.status,'total_amount',v_existing.total_amount); end if;
    raise;
  end;
end;
$function$

create or replace function public.create_customer_cod_order(
 p_items jsonb,p_customer_name text,p_customer_phone text,p_address1 text,p_address2 text,p_landmark text,
 p_city text,p_state text,p_pincode text,p_patient_name text default null,p_prescription_path text default null,
 p_request_id uuid default null,p_user_lat numeric default null,p_user_lon numeric default null
) returns jsonb language sql security invoker set search_path=''
as $function$ select mf_private.create_customer_cod_order_internal(
 p_items,p_customer_name,p_customer_phone,p_address1,p_address2,p_landmark,p_city,p_state,p_pincode,
 p_patient_name,p_prescription_path,p_request_id,p_user_lat,p_user_lon); $function$;
revoke all on function mf_private.create_customer_cod_order_internal(jsonb,text,text,text,text,text,text,text,text,text,text,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function mf_private.create_customer_cod_order_internal(jsonb,text,text,text,text,text,text,text,text,text,text,uuid,numeric,numeric) to authenticated;
revoke all on function public.create_customer_cod_order(jsonb,text,text,text,text,text,text,text,text,text,text,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.create_customer_cod_order(jsonb,text,text,text,text,text,text,text,text,text,text,uuid,numeric,numeric) to authenticated;
