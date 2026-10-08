import { useRef, useState } from "react";
import {
  Image,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ButtonDock } from "@/components/ui";
import {
  ONBOARD_SLIDES,
  type OnboardExit,
  type OnboardSlide,
  type OnboardSlideId,
  onboardPrimaryLabel,
} from "@/first-session/onboard-copy";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const SLIDE_IMAGES: Record<OnboardSlideId, ImageSourcePropType> = {
  register: require("../../assets/onboard/register.png"),
  collection: require("../../assets/onboard/collection.png"),
  wishlist: require("../../assets/onboard/wishlist.png"),
};

/** Tall enough to read the drawing, short enough that the card is not a full screen. */
const ILLUSTRATION_HEIGHT = space.insetLg * 16;
const CARD_INSET = space.insetMd;
const CARD_GAP = space.gapMd;
const LAST_SLIDE = ONBOARD_SLIDES.length - 1;

type OnboardScreenProps = {
  exit: OnboardExit;
  onComplete: () => void;
};

export function OnboardScreen({ exit, onComplete }: OnboardScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLastSlide = index === LAST_SLIDE;
  const cardWidth = width - CARD_INSET * 2;
  const stride = cardWidth + CARD_GAP;

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const landed = Math.round(event.nativeEvent.contentOffset.x / stride);
    setIndex(Math.max(0, Math.min(LAST_SLIDE, landed)));
  }

  function handlePrimary() {
    if (isLastSlide) {
      onComplete();
      return;
    }
    const next = index + 1;
    pager.current?.scrollTo({ x: next * stride, animated: true });
    setIndex(next);
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.fillSecondary }]}>
      <ScrollView
        ref={pager}
        horizontal
        decelerationRate="fast"
        snapToInterval={stride}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={[
          styles.pagerContent,
          { paddingTop: insets.top + CARD_INSET, paddingHorizontal: CARD_INSET },
        ]}
        style={styles.pager}
      >
        {ONBOARD_SLIDES.map((slide, slideIndex) => (
          <OnboardCard
            key={slide.id}
            slide={slide}
            width={cardWidth}
            gap={slideIndex === LAST_SLIDE ? 0 : CARD_GAP}
          />
        ))}
      </ScrollView>
      <OnboardDots activeIndex={index} />
      <ButtonDock>
        <Button
          label={onboardPrimaryLabel(isLastSlide, exit)}
          width="fill"
          onPress={handlePrimary}
        />
      </ButtonDock>
    </View>
  );
}

function OnboardCard({ slide, width, gap }: { slide: OnboardSlide; width: number; gap: number }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      style={[
        styles.card,
        {
          width,
          marginRight: gap,
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
        },
      ]}
    >
      <View style={styles.stage}>
        <Image
          source={SLIDE_IMAGES[slide.id]}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <View style={styles.copy}>
        <Text style={[typography.title, { color: theme.contentPrimary }]}>{slide.title}</Text>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>{slide.body}</Text>
      </View>
    </View>
  );
}

function OnboardDots({ activeIndex }: { activeIndex: number }) {
  const theme = useTheme();

  return (
    <View style={styles.dots}>
      {ONBOARD_SLIDES.map((slide, slideIndex) => (
        <View
          key={slide.id}
          style={[
            styles.dot,
            {
              backgroundColor:
                slideIndex === activeIndex ? theme.contentPrimary : theme.borderSubtle,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  pagerContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: CARD_INSET,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  stage: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: CARD_INSET,
    paddingTop: CARD_INSET,
  },
  image: {
    width: "100%",
    height: ILLUSTRATION_HEIGHT,
  },
  copy: {
    gap: space.gapSm,
    padding: CARD_INSET,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.gapSm,
    paddingBottom: CARD_INSET,
  },
  dot: {
    width: space.insetSm,
    height: space.insetSm,
    borderRadius: radius.pill,
  },
});
