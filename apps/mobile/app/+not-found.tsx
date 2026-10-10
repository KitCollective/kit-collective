import { Redirect, usePathname } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { isLegacyAuthPath, LEGACY_DOOR_PARAM_VALUE } from "@/first-session/legacy-routes";
import { LoadingScreen } from "@/first-session/splash-loading";

/**
 * Routes that no longer exist. The old collector auth screens open the Kom i gang sheet; anything
 * else goes back to the index. A signed-in collector always lands in Samling.
 */
export default function NotFound() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Redirect href="/(tabs)/collection" />;
  }

  if (isLegacyAuthPath(pathname)) {
    return (
      <Redirect
        href={{ pathname: "/(first-session)", params: { door: LEGACY_DOOR_PARAM_VALUE } }}
      />
    );
  }

  return <Redirect href="/" />;
}
