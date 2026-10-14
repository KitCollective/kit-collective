# Fixture photos for Device flows

131 real photos of 77 football shirts, for slice flows that pick photos from the simulator's library. They come from the `kc_test_kits` Drive folder and were taken by Frederik Lohse. Each is a 1024 px JPEG with its metadata stripped (no location, no camera data).

`catalog.json` describes every photo: its `name` (the file name without `.jpg`), the `jersey` it shows, the `angle` (`front`, `back`, `detail`, `label`) and the original `source` file. `jerseys` gives each shirt's team, whether it is a national team, the kit (`home`, `away`, `third`, `fourth`, `special`, `training`), and the season and player where they are known. The labels are a visual reading of the photos, not checked against the KitCollective catalog; the ones from `.scratch/vision-qa` ground truth carry colours and season too.

## Use them in a slice flow

Name the photos in the flow's header, in the order they should be added:

```yaml
# simulator-photos: fck-white-home-front, fck-white-home-back, italy-blue-home-front, italy-blue-home-back
```

`simulator.sh` then runs the flow on a simulator of its own that holds exactly those photos. The system photo picker shows the last one added first, so the last name in the list is the first cell. A flow without the line keeps the one-photo simulator (`../shirt-front.jpg`), and so do the regression flows.

Choosing:

- **Several shirts in one upload** (grouping, a bulk session): take the `front` and `back` of different jerseys. 45 jerseys have both.
- **One shirt from several angles**: one jersey's `front`, `back` and `detail` or `label` (`argentina-home-2006` has all four).
- **Look-alikes**: shirts of one colour from different teams, for example the white `denmark-white-away`, `psg-white-jordan` and `fck-white-home`.
- **Odd photos**: `unknown-nike-label` matches no shirt; `denmark-red-white-hummel-front` and `-front-2` are two photos of the same front.

Pick by what the flow must show, and keep the list as short as the flow allows: every photo is one more cell in the picker and one more thumbnail on screen.

## What not to do

- Do not add photos of people, or anything with a name or address on it, other than printed shirt names. `arsenal-red-home-2008-bendtner-detail` shows a signature dedicated "Til Frederik", which is the owner's own shirt.
- Screenshots of a local `device-run.sh` are uploaded to the public evidence bucket. Hosted runs on GitHub Actions keep them in the run's private artifact.
- Do not rename a photo a flow uses: the flow test (`scripts/tests/e2e-slices.test.mjs`) fails on a name that does not exist.
