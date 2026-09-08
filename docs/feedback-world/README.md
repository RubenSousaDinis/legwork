# Screenshots for `FEEDBACK-WORLD.md`

Every error dialog in `../../FEEDBACK-WORLD.md` is meant to carry an image. This is where they live.

- **Naming:** `<day>-<nn>.png` — the hackathon day, then a two-digit counter in the order the
  entries were written: `day1-01.png`, `day1-02.png`, `day4-01.png`. An entry references it as
  `` `docs/feedback-world/<day>-<nn>.png` ``, and every referenced file has to exist — the §9
  check in the brief fails the pass otherwise. An entry with no image yet says `screenshot pending`
  instead of naming a file that is not there.
- **Where they come from:** the operator attaches the PNGs to issue #40 or commits them under
  `raw/`. The pass that writes them up moves and renames them into this directory; nothing is
  cropped, so the whole dialog stays readable.
- **Redaction, before `git add`:** open the PNG at full size and paint a solid black box over any
  RP signing key, `rp_id`, session token, or personal data of the backup worker. This document is
  published, so a redaction missed here is a redaction missed in public.

Pass 1 committed no images: the operator holds three PNGs from the first phone run (the desktop
country-availability modal, the phone showing `verification_disabled`, and the phone after the
second attempt) and has not attached them yet. Entries E4, E5, E6 and E7 are waiting on those.
