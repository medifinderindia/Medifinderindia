"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("customer-v2/profile-adapter.js","utf8");
const ctx={window:{},Date,Number,String,RegExp,Object};
vm.runInNewContext(source,ctx);
let updatePayload=null,updatedRow=null,uploadPath=null;
const query={update(v){updatePayload=v;return this;},eq(k,v){assert.equal(k,"email");assert.equal(v,"person@example.com");return this;},select(){return this;},maybeSingle(){updatedRow={...updatePayload,id:"auth-1",email:"person@example.com"};return Promise.resolve({data:updatedRow,error:null});}};
const client={from(t){assert.equal(t,"profiles");return query;}};
(async()=>{
 const api=ctx.window.MFCustomerV2Profile.create(client,{id:"auth-1",email:"person@example.com"});
 const saved=await api.saveProfile({full_name:"Test Person",phone:"+91 98765 43210",date_of_birth:"1995-04-02",terms_accepted:true});
 assert.equal(saved.full_name,"Test Person");assert.equal(updatePayload.phone,"9876543210");assert.equal(updatePayload.terms_accepted,true);
 await assert.rejects(()=>api.saveProfile({full_name:"",phone:"9876543210",date_of_birth:"1995-04-02",terms_accepted:true}),/full name/);
 await assert.rejects(()=>api.saveProfile({full_name:"Test",phone:"123",date_of_birth:"1995-04-02",terms_accepted:true}),/10-digit/);
 await assert.rejects(()=>api.saveProfile({full_name:"Test",phone:"9876543210",date_of_birth:"2099-01-01",terms_accepted:true}),/date of birth/);
 await assert.rejects(()=>api.saveProfile({full_name:"Test",phone:"9876543210",date_of_birth:"1995-04-02",terms_accepted:false}),/Terms/);
 await assert.rejects(()=>api.saveProfile({full_name:"Test",phone:"9876543210",date_of_birth:"2023-02-29",terms_accepted:true}),/date of birth/);
 console.log("PASS: profile validation and save contract");
})().catch(e=>{console.error(e);process.exitCode=1;});
