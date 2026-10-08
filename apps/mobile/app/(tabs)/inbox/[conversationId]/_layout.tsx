import { Stack } from "expo-router";
import { stackScreenMotion } from "@/navigation/stack-motion";
import { useReduceMotion } from "@/theme/use-reduce-motion";

export default function ConversationLayout() {
  const reduceMotion = useReduceMotion();
  return (
    <Stack screenOptions={{ headerShown: false, animation: stackScreenMotion(reduceMotion) }} />
  );
}
