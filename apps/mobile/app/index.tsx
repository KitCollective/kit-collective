import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "./_layout";

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/collection" />;
}
