# Runbook — rename the app Worker off `iqraifs`

**Status:** prepared 18 Sep 2026, not yet executed.
**Do this in a quiet window** — not while parents are being onboarded and
not on a school day. Budget 30 minutes; the risky part is ~5.

---

## Why

One Cloudflare Worker, currently named **`iqraifs`**, serves *everything*:

| Hostname | What it is |
|---|---|
| `iqraifs.com` | Iqra IFS — the first client's own site and portal |
| `www.iqraifs.com` | folds to the apex |
| `app.theilmnetwork.com` | the platform host for schools with no domain |
| `family.theilmnetwork.com` | **the family product** — a different product, different audience |

The name is now wrong and, worse, it is a trap: anyone tidying up after a
departed client could delete "the client's worker" and take the platform
*and the family product* down with it. Nothing is functionally broken —
this is purely removing a foot-gun.

> The marketing site is a **separate** Worker called `theilmnetwork`
> (`marketing/wrangler.jsonc`). **Do not touch it.**

## Suggested new name

`ilm-network-app` — names the platform, not a client. Anything neutral
works; the rest of this runbook says NEW_NAME.

---

## What makes this awkward

A Cloudflare Worker cannot be renamed in place. Changing `name` in
`wrangler.jsonc` makes the next build deploy to a **different, empty**
Worker, while the old one keeps serving all four domains **with stale
code**. That fails quietly — the site stays up but stops receiving
updates — so the domain moves must actually be finished, not half-done.

Each domain move is: remove from old Worker → add to new. Cloudflare will
not let two Workers hold the same custom domain, so **that hostname is
down for the seconds in between.**

---

## Before you start

- [ ] Nothing else in flight — no pending PR, no parent message going out.
- [ ] Note the current state so you can compare afterwards:
      **Workers & Pages → `iqraifs` → Settings → Domains & Routes** should
      list exactly the four hostnames in the table above.
- [ ] Confirm the site is healthy right now (see **Verify** below).

---

## Steps

### 1. Point the repo at the new name

In `wrangler.jsonc` at the repo root, change:

```jsonc
"name": "iqraifs",     ->     "name": "NEW_NAME",
```

Update the comment above it too — it explains that the name must match the
Cloudflare project. Merge to `main`.

The Cloudflare build runs `wrangler deploy`, which reads that `name`, so
this **creates the new Worker** with the current code.

> From this moment the old Worker is frozen: it still serves all four
> domains, but with the code as of this deploy. That is fine and is the
> safety net — do not delete it yet.

### 2. Prove the new Worker actually works before moving any traffic

The new Worker has no hostname, so give it a temporary one:

**Workers & Pages → NEW_NAME → Settings → Domains & Routes → Enable
`workers.dev`**

Open `https://NEW_NAME.<your-subdomain>.workers.dev/`. You should get the
app shell. It will *not* show a school site — no school owns that
hostname, which is correct behaviour.

**Turn `workers.dev` back off** once you have seen it. A public
`*.workers.dev` copy of the app is a second front door nobody chose.

> **Stop here if the new Worker did not serve anything.** Nothing has
> moved yet; the site is still fine on the old Worker.

### 3. Move the domains — least critical first

For each hostname, in this order:

1. `family.theilmnetwork.com`
2. `app.theilmnetwork.com`
3. `www.iqraifs.com`
4. `iqraifs.com`  ← the school's live domain, do it last

For each one:

- **`iqraifs` → Settings → Domains & Routes** → the `…` menu on that row →
  **Remove**
- **NEW_NAME → Settings → Domains & Routes → Add → Custom domain** → type
  the full hostname → Add
- **Verify that hostname before moving to the next** (see below)

Do them one at a time. If the first one misbehaves you have only broken
the family host, not the school.

### 4. Repoint the build integration

**NEW_NAME → Settings → Build** → connect the same repository, production
branch `main`, and the same deploy command the old Worker used
(`npx wrangler deploy`), root directory the repo root.

Then **disconnect the build on `iqraifs`** so a future push cannot appear
to deploy from a Worker that serves nothing.

### 5. Leave the old Worker alone for a week

It now holds no domains and costs nothing. Delete it only once you are
sure, and rename nothing else in the meantime.

---

## Verify

After **each** domain move, and again at the end:

```bash
# The school's site at a clean URL, previewing under its own name
curl -sI https://iqraifs.com/ | head -1
curl -s  https://iqraifs.com/ | grep -o '<title>[^<]*'

# www folds to the apex (one origin, or parents get logged out)
curl -sI https://www.iqraifs.com/ | grep -i location

# The link parents already have in WhatsApp
curl -s "https://iqraifs.com/school-login?org=iqra-ifs&claim=1" | grep -o '<title>[^<]*'

# Family routes leave the school's domain
curl -sI https://iqraifs.com/rewards | grep -i location

# Assets are real files, not index.html  (run_worker_first: true makes
# every request pass through the Worker, so this is the thing to watch)
curl -s https://iqraifs.com/ | grep -o 'assets/index-[^"]*\.js'
curl -s https://iqraifs.com/assets/<that-file> | head -c 40
```

Expected: `200` and `Iqra Islamic Foundation School` for the school pages,
a `location:` to the apex for www, a `location:` to
`family.theilmnetwork.com` for `/rewards`, and real JavaScript (not
`<!doctype html>`) for the asset.

---

## Rollback

At any point, on any hostname: **remove it from NEW_NAME and add it back
to `iqraifs`.** The old Worker still has working code for as long as you
leave it in place — which is the whole reason step 5 says to wait.

If you have already merged step 1 and want to abandon the move entirely,
revert `wrangler.jsonc` to `"name": "iqraifs"` and push; the next build
deploys to the old Worker again and everything is as it was.

---

## Notes for whoever runs this

- **"Add Domain" / "Connect domain", never "Add Route."** Connect-domain
  takes a whole hostname and creates the DNS record for you. A Route
  matches a URL pattern on a hostname whose DNS record must already
  exist, so a Route on a subdomain with no record never gets traffic.
- **Do not pre-create the DNS record.** Connect-domain does it.
- **A fresh record can take minutes to reach every resolver**, and any
  machine that looked it up while it did not exist caches the failure.
  Check the truth with
  `https://cloudflare-dns.com/dns-query?name=<host>&type=A`
  (header `accept: application/dns-json`) rather than a local lookup.
- The `iqraifs.com` zone belongs to the school's domain. If IFS ever
  leaves, only that hostname goes with them — `theilmnetwork.com` and
  everything on it is unaffected.
