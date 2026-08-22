# SEALS MVP demo data

Run the idempotent seed from `backend`:

```powershell
npm run seed:mvp
```

The seed preserves existing accounts and upserts only records marked as MVP demo data.

## Demo logins

All demo users use the password `Demo@12345`.

| Role | Emails | Records |
| --- | --- | ---: |
| Wholesaler | `wholesaler1@seals.demo` … `wholesaler6@seals.demo` | 6 |
| Buyer / Retailer | `buyer1@seals.demo` … `buyer6@seals.demo` | 6 |
| Shipper | `shipper1@seals.demo` … `shipper6@seals.demo` | 6 |

## Dataset

- 72 active products across seven categories.
- 36 orders covering pickup and third-party shipping, with several order statuses.
- 36 order conversations with buyer, seller, and assigned shipper participants.
- 12 social posts, ratings, follows, payment obligations, and 36 shipping rates.
- Product cost, stock, tier pricing, discounts, specifications, FAQs, lead time, and return policy.

## Media in development

When Cloudinary is incomplete, authenticated uploads are stored under `backend/public/uploads` in development only. Production still requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
