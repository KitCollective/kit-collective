import { WishlistScreen } from "@/components/wishlist-screen";
import { registerPlaceHome } from "@/navigation/place-homes";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";

export default function WishlistTab() {
  return <PlacePagerScreen place="wishlist" />;
}

registerPlaceHome("wishlist", WishlistScreen);
