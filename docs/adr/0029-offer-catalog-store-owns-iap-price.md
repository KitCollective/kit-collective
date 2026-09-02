# Offer catalog is Admin-owned; IAP price is the store

Staff access stays `User.role`. Collector plan is Entitlement (yes/no, expires, source). Admin may edit an Offer catalog — live month/year IAP product ids, Nest-trial on/off, trial days — so those values are not hardcoded in Nest. Apple and Google remain merchant of record in the Expo binaries: the kroner the collector pays and the localized display price come from the store SDK, not an Admin DKK column. Nest-trial is source `trial`, not an App Store introductory offer.

Status: accepted.
