/**
 * NativeTabs lazy-loads tab routes, so `registerPlaceHome` would otherwise
 * run only after the first visit. Importing the indexes here registers every
 * parent home before the first swipe, so the pager can render neighbours.
 */
import "../../app/(tabs)/collection/index";
import "../../app/(tabs)/inbox/index";
import "../../app/(tabs)/profile/index";
import "../../app/(tabs)/search/index";
import "../../app/(tabs)/wishlist/index";
