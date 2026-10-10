# YehiaFlowers

Wholesale cut-flower ordering. Customers browse by category, pick colors and packs, and the order is sent to the
owner on WhatsApp. Every order is also saved in Supabase, so the owner gets a dashboard with photos.

No build step, no dependencies. Plain HTML, CSS and JavaScript modules.

## What is in the box

| Address | What it is |
|---|---|
| `/` | Store: hero slider, categories, all flowers with category filters, colors with photos, cart, WhatsApp order |
| `/order/?t=<code>` | Order page with photos. The link is added to every WhatsApp order message (on Vercel `/o/<code>` also works) |
| `/admin` | Owner panel: dashboard, orders, catalog and photos, storefront (hero and covers), stock, settings |

## Folder structure

```
index.html                  store page
admin/index.html            admin page
order/index.html            public order page
assets/css/                 base.css (design system), store.css, order.css, admin.css
assets/js/shared/           config, API client, language/theme, plural rules, icons, dialogs, toasts, lightbox
assets/js/store/            state.js (data + cart + message), views.js (screens), app.js (router, slider, events)
assets/js/order/main.js     order page
assets/js/admin/            auth, db, images (resizing), focal (crop picker), orders, catalog, storefront, stock, dashboard, settings, main
supabase/schema.sql         database, access rules, order function, photo storage
vercel.json / serve.json    rewrites and headers (Vercel / local `npx serve`)
```

## Setup (about 15 minutes)

1. **Database.** Supabase dashboard > SQL Editor > paste `supabase/schema.sql` > Run.
   It is safe to run again, **and you must run it again after every update of this project** (new columns and tables).
   Choose "Run and enable RLS" if the editor warns.
2. **Owner login.** Authentication > Users > Add user (email + password).
   Then run: `insert into public.admins (user_id) values ('THE-USER-ID');`
   Also turn off "Allow new users to sign up" in the Authentication settings.
3. **Keys.** Check `url` and `key` (the publishable key) in `assets/js/shared/config.js`.
   Never put the secret key (`sb_secret_...`) anywhere in this project.
4. **Run locally** (below), open `/admin`, sign in, then Catalog > Load starter catalog.
5. **WhatsApp number.** Admin > Settings, with country code (example `201012345678`).
6. **Photos.** Admin > Catalog > open a flower > add photos to each color. After uploading a single photo the
   crop picker opens so you can choose exactly which part stays visible (also under the crop icon on every photo).
7. **Storefront.** Admin > Storefront: add the hero slider images, and upload a cover for any category.
8. **Deploy** to Vercel (drag the folder in, or push to GitHub and import it). Set `siteUrl` in `config.js` to the
   final address so the links in WhatsApp messages are correct.

## Run locally

Serve the folder over http. **Opening `index.html` by double-clicking does not work** (browsers block JavaScript
modules on `file://`).

```bash
npx serve . -l 3000        # needs Node.js
# or
python3 -m http.server 3000
```

Open http://localhost:3000. Both servers work for every page, including the order page.

## Choosing which part of a photo shows

Every photo, hero image and category cover has a focus point. Click or drag on the photo (or use the arrow keys) in
the crop picker; the previews show the real crops (product card, gallery, desktop and phone hero, category tile).
The store applies it with CSS `object-position`, so the same photo looks right in every shape.

## About the `#` in addresses (`/#/shop`)

The store is a single page. The part after `#` is the "screen" (`#/shop`, `#/c/roses`, `#/cart`). Browsers never send
it to the server, so every address works with no server setup and the Back button works. If you later want addresses
without `#` (for example `/shop`), the router can be switched to the History API; the host then has to serve
`index.html` for unknown paths (Vercel: one rewrite).

## How an order flows

1. The customer taps send. The browser calls `create_order` in the database.
   The database re-checks everything and copies names, pack size and photo itself, so nothing can be forged.
2. WhatsApp opens with the message (English header, then the order in Arabic and in English, then the order link).
3. The owner sees the order in `/admin`, with photos, and changes its status. New orders appear within 25 seconds.

## Security notes

- Customers can only read the active catalog, hero images and settings, and call `create_order` and `get_order_by_token`.
- The order link uses a random 16-character code and never shows the phone number.
- Only users listed in `public.admins` can read or change orders, the catalog, settings and photos.
- A phone number is limited to 5 orders per hour.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Blank page, console says modules blocked | Opened as a file. Use a local server (above) |
| Console: 404 for `/assets/...` | Server started inside a subfolder. Start it in the folder containing `index.html` |
| "We could not load the catalog" | SQL not run, or wrong `url` / `key` in `config.js`. Check the Network tab |
| Hero slider or covers do not appear after an update | Run the newest `supabase/schema.sql` again, then reload |
| Admin Storefront says "needs the latest database update" | Same: run `supabase/schema.sql` again |
| Order page says "Order not found" | The link was cut off (it must keep `?t=...`), or the order was deleted |
| Admin says "does not have admin access" | The `insert into public.admins` step was not run for this user |
| Photos do not appear | The `photos` row exists but the file path is wrong, or the bucket is not public |
| WhatsApp opens without a number | WhatsApp number not set in Admin > Settings |
