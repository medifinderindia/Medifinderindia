# MediFinder App Audit Report

## Summary
- **18 HTML files** audited across user, merchant, delivery, and admin sections
- **2 prompt() calls** found (should be replaced with modals)
- **2 "coming soon" stubs** found (non-functional handlers)
- **1 hardcoded admin password** found (security risk)
- **20+ hardcoded coordinates** found (fallback to Kolkata defaults)
- **Multiple spelling inconsistencies** (marchent vs merchant, delyvary vs delivery)
- **Mixed lang attributes** (some pages `lang="bn"` vs `lang="en"`)

---

## Critical Issues

### 1. prompt() Calls (Replace with Modals)
| File | Line | Issue |
|------|------|-------|
| `admin-dashboard.html` | 1416 | `prompt('Enter broadcast message:')` - Should use modal with textarea |
| `marchentpromotions.html` | 781 | `prompt('Update price for...')` - Should use modal with input field |

### 2. Hardcoded Admin Password
| File | Line | Issue |
|------|------|-------|
| `index.html` | 163 | Admin login uses hardcoded password check in client-side JS - **SECURITY RISK** |

### 3. "Coming Soon" Stubs (Non-Functional)
| File | Line | Issue |
|------|------|-------|
| `admin-dashboard.html` | 1425 | Refunds management - shows toast but no implementation |
| `admin-dashboard.html` | 1430 | Service zones management - shows toast but no implementation |
| `marchenthome.html` | 1392 | Messages feature - shows toast but no implementation |
| `marchentpromotions.html` | 796 | Stats view - shows toast but no implementation |
| `product-detail.html` | 355 | "See All Reviews" button - shows toast but no implementation |

---

## Hardcoded Demo Data

### Coordinates (Kolkata defaults)
| File | Line | Variable |
|------|------|----------|
| `userscript.js` | 22-24 | `userLiveLat = 22.5726`, `userLiveLng = 88.3639`, `shopCoordinates` |
| `delyvaryscript.js` | 98-99, 103-104, 171-172 | Fallback coordinates `22.5726`, `88.3639` |
| `marchentscript.js` | 1601-1602 | Fallback coordinates `22.5726`, `88.3639` |

### Hardcoded Values
| File | Line | Variable |
|------|------|----------|
| `delyvaryscript.js` | 12 | `riderActiveMinutes = 600` (10 hours hardcoded) |
| `marchentprofile.html` | 42 | `value="Niramoy Traders"` hardcoded shop name |
| `marchentdboyrequest.html` | 39 | `value="#ORD-98745"` hardcoded order ID |

### Placeholder Images
✅ **Fixed** — All `via.placeholder.com` images replaced with real Unsplash/Flaticon images:
- KYC images → Flaticon user icon
- Prescription images → Unsplash medicine image
- Logo fallbacks → Unsplash pharmacy image

---

## Spelling Inconsistencies
The following misspellings are consistent across filenames and code, so no broken links:
- **"marchent"** instead of "merchant" (all merchant pages)
- **"delyvary"** instead of "delivery" (all delivery pages)
- **"dboy"** instead of "delivery boy" or "rider" (admin pages)

---

## Mixed Language Attributes
| File | Issue |
|------|-------|
| `delyvaryhome.html` | `lang="bn"` (Bengali) |
| `delyvaryearning.html` | `lang="bn"` (Bengali) |
| All other pages | `lang="en"` (English) |

---

## Security Concerns

### 1. Client-Side Admin Authentication
- `index.html`: Admin password checked in client-side JavaScript
- Risk: Password visible in page source, can be bypassed by modifying JS

### 2. Hardcoded Supabase Anon Key
The same anon key is repeated in 18 files:
```
sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ
```
**Recommendation**: Use a single config file or environment variable.

---

## Missing Functionality

### Empty/Stub Handlers
| File | Function | Issue |
|------|----------|-------|
| `admin-dashboard.html` | `handleRefunds()` | Only shows toast |
| `admin-dashboard.html` | `handleZones()` | Only shows toast |
| `marchenthome.html` | Messages handler | Only shows toast |
| `product-detail.html` | Reviews handler | Only shows toast |

### Incomplete Features
- **Refunds management**: Admin dashboard has no implementation
- **Service zones**: Admin dashboard has no implementation
- **Merchant messaging**: No implementation
- **Review system**: Product detail page has no implementation
- **Stats view**: Merchant promotions page has no implementation

---

## Recommendations

### High Priority
1. **Replace prompt() calls** with proper modal components (prod-utils.js has `showCustomModal()`)
2. **Move admin authentication** to server-side (Supabase RLS or Edge Function)
3. **Centralize Supabase config** into single `config.js` file

### Medium Priority
4. **Implement coming soon features** or remove buttons
5. **Fix lang attributes** - set all pages to `lang="en"` or `lang="bn"` consistently
6. **Replace placeholder images** with proper error handling

### Low Priority
7. **Fix spelling** in filenames (marchent → merchant, delyvary → delivery) if not too disruptive
8. **Remove hardcoded coordinates** and use proper geolocation fallbacks
9. **Consolidate hardcoded values** into configuration

---

## Files Audited
1. `userhome.html`
2. `usercart.html`
3. `userorder.html`
4. `usermap.html`
5. `product-detail.html`
6. `marchenthome.html`
7. `marchentorders.html`
8. `marchentadd.html`
9. `marchentinventory.html`
10. `delyvaryhome.html`
11. `delyvaryorder.html`
12. `delyvaryearning.html`
13. `delyvaryprofile.html`
14. `adminuser.html`
15. `adminmarchent.html`
16. `admindboy.html`
17. `admin-dashboard.html`
18. `adminsponsored.html`

### Shared JS Files Reviewed
- `userscript.js`
- `marchentscript.js`
- `delyvaryscript.js`
- `prod-utils.js`
- `adminuser.js`
- `adminmarchent.js`
- `admindboy.js`
