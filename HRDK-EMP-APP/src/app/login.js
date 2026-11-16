import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEMO } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorText, IconCircle, Loading, tap } from "../ui/components";
import { elevation, radius, space, type, useTheme } from "../ui/theme";

const LOGO = require("../assets/logo.png");
const MARK = 72; // logo size on screen
const BOX = 96; // white box around the logo
// logo.png is 256 px wide; the empty gap between the H bar and the R bar is
// at x = 72, so cutting there gives an "H" piece and an "R" piece.
const CUT = Math.round((MARK * 72) / 256);

// Soft gold that reads well on the HRDK blue (a jeweller's touch).
const GOLD = "#F2D08A";
const TITLE = "HRDK Jewel Craft";
const HERO_CORNER = radius.hero + 10;

// Gold ring drawn around the logo in the intro.
const RING = 156;
const RING_R = RING / 2 - 3;
const RING_LEN = 2 * Math.PI * RING_R;

// Native driver for transform/opacity; web has no native driver.
const ND = Platform.OS !== "web";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// What the app gives an employee, shown under the login card.
const PERKS = [
  ["finger-print-outline", "Your punches and hours, every day", "brand"],
  ["airplane-outline", "Leave balance and requests", "good"],
  ["wallet-outline", "Payslips each month", "gold"]
];

// Greeting on the card by time of day.
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Soft circles drifting in the blue hero: size, position, drift distance, loop time.
const BUBBLES = [
  { size: 180, top: -60, left: -50, dx: 18, dy: 14, ms: 7000 },
  { size: 120, top: 40, right: -40, dx: -14, dy: 18, ms: 8500 },
  { size: 70, top: 150, left: 30, dx: 12, dy: -10, ms: 6000 },
  { size: 46, top: 24, right: 90, dx: -8, dy: 12, ms: 5200 }
];

// Little gold glints that keep twinkling in the hero after the intro.
const HERO_GLINTS = [
  { top: 70, left: "14%", size: 12, wait: 400 },
  { top: 34, right: "20%", size: 9, wait: 1600 },
  { top: 132, right: "12%", size: 14, wait: 2600 }
];

// Glints that flash on the gold ring once the logo is built: angle on the ring, size.
const RING_GLINTS = [
  [-40, 18],
  [140, 13],
  [215, 10]
];

// Entrance pieces after the intro, in order: (unused), title, subtitle, card,
// card header, field, button, perks..., footer.
const STEPS = 6 + PERKS.length + 1;

// True when the phone asks for less motion; animations then just appear.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => alive && setReduced(Boolean(on)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (on) => setReduced(Boolean(on)));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

// One slowly drifting circle; stands still when motion is reduced.
function Bubble({ size, top, left, right, dx, dy, ms, still }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) {
      t.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        Animated.timing(t, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: ND })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [still, ms, t]);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2, top, left, right, transform: [{ translateX }, { translateY }, { scale }] }
      ]}
    />
  );
}

// Four-point star, the classic diamond sparkle.
function Sparkle({ size, color = GOLD }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 0C12.9 7.6 16.4 11.1 24 12C16.4 12.9 12.9 16.4 12 24C11.1 16.4 7.6 12.9 0 12C7.6 11.1 11.1 7.6 12 0Z" fill={color} />
    </Svg>
  );
}

// A sparkle that twinkles (grow, turn, fade) every few seconds.
function Twinkle({ top, left, right, size, wait, still }) {
  const t = useRef(new Animated.Value(still ? 0.6 : 0)).current;
  useEffect(() => {
    if (still) {
      t.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(wait),
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: ND }),
        Animated.delay(2400)
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [still, wait, t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        left,
        right,
        opacity: t,
        transform: [{ scale: t }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }]
      }}
    >
      <Sparkle size={size} />
    </Animated.View>
  );
}

// White logo box with the logo cut into an H piece and an R piece, so each can
// move on its own. `shine` (0..1) sweeps a soft light across the box.
function LogoMark({ c, style, hStyle, rStyle, shine, onLayout, label = true }) {
  return (
    <Animated.View style={[styles.logo, elevation(c, 2), style]} onLayout={onLayout}>
      <View
        style={styles.logoImage}
        accessible={label}
        accessibilityRole={label ? "image" : undefined}
        accessibilityLabel={label ? "HRDK logo" : undefined}
        importantForAccessibility={label ? "auto" : "no-hide-descendants"}
      >
        <Animated.View style={[styles.logoPiece, { left: 0, width: CUT }, hStyle]}>
          <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.logoPiece, { left: CUT, width: MARK - CUT }, rStyle]}>
          <Image source={LOGO} style={[styles.logoImage, { marginLeft: -CUT }]} resizeMode="contain" />
        </Animated.View>
      </View>
      {shine ? (
        <View style={styles.shineClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.shine,
              { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-BOX, BOX] }) }, { rotate: "20deg" }] }
            ]}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFF6DD" stopOpacity="0" />
                  <Stop offset="0.5" stopColor="#FFF6DD" stopOpacity="0.85" />
                  <Stop offset="1" stopColor="#FFF6DD" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#shine)" />
            </Svg>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  );
}

// Employee ID box with a floating label: the label sits in the box, and lifts
// up small when the box is focused or filled; a brand line grows underneath.
function IdInput({ c, value, onChangeText, onSubmit, inputRef, error, reduced }) {
  const [focused, setFocused] = useState(false);
  const [labelW, setLabelW] = useState(0);
  const lift = useRef(new Animated.Value(value ? 1 : 0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const up = focused || Boolean(value);

  useEffect(() => {
    const to = (v, toValue) => Animated.timing(v, { toValue, duration: reduced ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: ND });
    Animated.parallel([to(lift, up ? 1 : 0), to(line, focused ? 1 : 0)]).start();
  }, [up, focused, reduced, lift, line]);

  const SMALL = 0.78;
  const labelStyle = {
    transform: [
      { translateX: lift.interpolate({ inputRange: [0, 1], outputRange: [0, (-labelW * (1 - SMALL)) / 2] }) },
      { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
      { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, SMALL] }) }
    ]
  };
  const tint = error ? c.bad : focused ? c.brand : c.muted;

  return (
    <View style={[styles.idBox, { backgroundColor: c.sunk, borderColor: error ? c.bad : focused ? c.brandSoft : "transparent" }]}>
      <Ionicons name="id-card-outline" size={20} color={tint} />
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Animated.Text
          pointerEvents="none"
          onLayout={(e) => setLabelW(e.nativeEvent.layout.width)}
          style={[type.body, styles.idLabel, { color: tint, fontWeight: up ? "600" : "400" }, labelStyle]}
        >
          Employee ID
        </Animated.Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused && !value ? "e.g. 10395" : ""}
          placeholderTextColor={c.faint}
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          maxLength={10}
          accessibilityLabel="Employee ID"
          style={[styles.idText, { color: c.text }]}
        />
      </View>
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear Employee ID">
          <Ionicons name="close-circle" size={20} color={c.faint} />
        </Pressable>
      ) : null}
      <Animated.View style={[styles.idLine, { backgroundColor: error ? c.bad : c.brand, transform: [{ scaleX: line }] }]} />
    </View>
  );
}

// Log in button: springs down when pressed, a soft gold light runs across it
// now and then while it is ready, and shows a spinner while checking.
function ShimmerButton({ c, title, onPress, disabled, loading, reduced }) {
  const press = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const live = !disabled && !loading && !reduced;

  useEffect(() => {
    if (!live) {
      sweep.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        Animated.delay(2600),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: ND })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [live, sweep]);

  const spring = (toValue) => Animated.spring(press, { toValue, friction: 6, tension: 180, useNativeDriver: ND }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPressIn={() => spring(1)}
      onPressOut={() => spring(0)}
      onPress={() => {
        tap();
        onPress?.();
      }}
    >
      <Animated.View
        style={[
          styles.goBtn,
          elevation(c, 1),
          {
            backgroundColor: c.brand,
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }]
          }
        ]}
      >
        <View style={styles.goShineClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.goShine,
              { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 520] }) }, { rotate: "20deg" }] }
            ]}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="goShine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={GOLD} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={GOLD} stopOpacity="0.55" />
                  <Stop offset="1" stopColor={GOLD} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#goShine)" />
            </Svg>
          </Animated.View>
        </View>
        {loading ? (
          <View style={styles.goInner}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={[type.heading, { color: "#FFFFFF" }]}>Checking…</Text>
          </View>
        ) : (
          <View style={styles.goInner}>
            <Text style={[type.heading, { color: "#FFFFFF", fontSize: 16 }]}>{title}</Text>
            <Animated.View
              style={[
                styles.goArrow,
                { transform: [{ translateX: press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }
              ]}
            >
              <Ionicons name="arrow-forward" size={16} color={c.brand} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Faint cut-diamond outline in the page background.
function Facet({ color, size }) {
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 100 80" fill="none">
      <Path d="M20 2H80L98 26L50 78L2 26Z M2 26H98 M20 2L35 26L50 78 M80 2L65 26L50 78 M35 26L50 2L65 26" stroke={color} strokeWidth={1.2} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Login with the Employee ID (the Matrix / COSEC ID on the punch machines).
// For now the ID alone logs in; OTP or password comes later (server
// portal/me.controller.js, EMP_APP_ID_LOGIN).
export default function Login() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { employee, checking, signIn } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reduced = useReducedMotion();

  // Entrance values, 0 = hidden/start, 1 = done.
  const steps = useRef(Array.from({ length: STEPS }, () => new Animated.Value(0))).current;
  const chars = useRef(Array.from(TITLE, () => new Animated.Value(0))).current; // title, letter by letter
  const ring = useRef(new Animated.Value(0)).current; // gold ring drawing itself (SVG prop: JS driver)
  const logo = useRef(new Animated.Value(0)).current; // white box pops in
  const letters = useRef(new Animated.Value(0)).current; // H and R fly in from the sides
  const shine = useRef(new Animated.Value(0)).current; // light sweeps over the logo
  const glint = useRef(new Animated.Value(0)).current; // sparkles flash on the ring
  const move = useRef(new Animated.Value(0)).current; // 0 = logo in screen centre, 1 = in its place at the top
  const shake = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);
  const ready = !checking && !employee;

  // Intro: on a deep blue screen a gold ring draws itself, the logo builds up
  // inside it, a light sweeps over it and the ring sparkles. Then the logo
  // rises to its place, the blue folds up into the header and the form comes
  // in. Needs the logo's final spot (slotY), header height and screen height.
  const [slotY, setSlotY] = useState(null);
  const [heroH, setHeroH] = useState(null);
  const [areaH, setAreaH] = useState(null);
  const [introDone, setIntroDone] = useState(false);
  const measured = slotY != null && heroH != null && areaH != null;

  useEffect(() => {
    if (!ready) return;
    const finish = () => {
      setIntroDone(true);
      inputRef.current?.focus?.();
    };
    if (reduced) {
      [ring, logo, letters, move, ...steps, ...chars].forEach((v) => v.setValue(1));
      finish();
      return;
    }
    if (!measured) return;
    const ease = (v, duration, easing = Easing.out(Easing.cubic), native = ND) =>
      Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: native });
    const anim = Animated.sequence([
      Animated.parallel([
        ease(ring, 800, Easing.inOut(Easing.cubic), false),
        Animated.sequence([Animated.delay(250), ease(logo, 500, Easing.out(Easing.back(1.6)))]),
        Animated.sequence([Animated.delay(500), ease(letters, 650, Easing.out(Easing.back(1.3)))]),
        Animated.sequence([Animated.delay(1150), ease(shine, 650, Easing.inOut(Easing.quad))]),
        Animated.sequence([Animated.delay(1150), ease(glint, 800, Easing.linear)])
      ]),
      Animated.parallel([
        ease(move, 800, Easing.inOut(Easing.cubic)),
        Animated.sequence([
          Animated.delay(350),
          Animated.parallel([
            Animated.stagger(35, chars.map((v) => ease(v, 380, Easing.out(Easing.back(1.4))))),
            Animated.stagger(70, steps.map((v) => ease(v, 420)))
          ])
        ])
      ])
    ]);
    anim.start(({ finished }) => finished && finish());
    return () => anim.stop();
  }, [ready, reduced, measured, ring, logo, letters, shine, glint, move, steps, chars]);

  // Card shakes side to side when login fails.
  function shakeCard() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    if (reduced) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 55, easing: Easing.linear, useNativeDriver: ND }))
    ).start();
  }

  if (checking) return <Loading />;
  if (employee) return <Redirect href="/" />;

  async function submit() {
    const id = employeeId.trim();
    if (!id) {
      setError("Enter your Employee ID");
      shakeCard();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signIn(id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      shakeCard();
    }
  }

  // Fade + rise for entrance step i.
  const rise = (i, from = 18) => ({
    opacity: steps[i],
    transform: [{ translateY: steps[i].interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }]
  });

  const logoStyle = {
    opacity: logo.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
    transform: [
      { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
      { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ["-45deg", "0deg"] }) }
    ]
  };

  // H piece comes from the left, R piece from the right, and they meet.
  const piece = (from, turn) => ({
    opacity: letters.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
    transform: [
      { translateX: letters.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
      { rotate: letters.interpolate({ inputRange: [0, 1], outputRange: [turn, "0deg"] }) }
    ]
  });
  const hStyle = piece(-70, "-25deg");
  const rStyle = piece(70, "25deg");

  // Intro group (ring + logo): starts 1.5x in the screen centre, ends exactly
  // on the real logo's spot (its centre is slotY + BOX / 2).
  const fromCentre = measured ? areaH / 2 - (slotY + BOX / 2) : 0;
  const introGroupStyle = {
    transform: [
      { translateY: move.interpolate({ inputRange: [0, 1], outputRange: [fromCentre, 0] }) },
      { scale: move.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }
    ]
  };
  // The ring opens out and fades as the logo rises.
  const ringStyle = {
    opacity: move.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: "clamp" }),
    transform: [
      { scale: move.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
      { rotate: ring.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) }
    ]
  };
  // The blue screen folds up into the header: it is taller than the screen
  // (its rounded bottom starts out of sight) and slides up until its bottom
  // meets the header's bottom, then fades over the real header.
  const curtainH = (areaH || 0) + HERO_CORNER * 2;
  const curtainStyle = {
    height: curtainH,
    opacity: move.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
    transform: [{ translateY: move.interpolate({ inputRange: [0, 1], outputRange: [0, (heroH || 0) - curtainH] }) }]
  };
  const edge = c.dark ? c.brandSoft : "#0B3550";

  const card = rise(3, 48);
  const cardStyle = { opacity: card.opacity, transform: [...card.transform, { translateX: shake }] };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ width: "100%" }} contentContainerStyle={{ flexGrow: 1, width: "100%" }} keyboardShouldPersistTaps="handled">
        <View
          style={[styles.hero, { backgroundColor: c.brand, paddingTop: insets.top + space.xxl }]}
          onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}
        >
          {BUBBLES.map((b, i) => (
            <Bubble key={i} {...b} still={reduced} />
          ))}
          {introDone ? HERO_GLINTS.map((g, i) => <Twinkle key={i} {...g} still={reduced} />) : null}
          <LogoMark c={c} style={{ opacity: introDone ? 1 : 0 }} onLayout={(e) => setSlotY(e.nativeEvent.layout.y)} />

          <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={TITLE}>
            {Array.from(TITLE).map((ch, i) => (
              <Animated.Text
                key={i}
                importantForAccessibility="no"
                style={[
                  type.display,
                  {
                    color: "#FFFFFF",
                    opacity: chars[i],
                    transform: [
                      { translateY: chars[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                      { scale: chars[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }
                    ]
                  }
                ]}
              >
                {ch === " " ? " " : ch}
              </Animated.Text>
            ))}
          </View>

          <Animated.View style={[styles.tagline, rise(2, 8)]}>
            <Animated.View style={[styles.rule, { transform: [{ scaleX: steps[2] }] }]} />
            <Text style={[type.small, styles.taglineText]}>EMPLOYEE APP</Text>
            <Animated.View style={[styles.rule, { transform: [{ scaleX: steps[2] }] }]} />
          </Animated.View>
        </View>

        <View style={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.facet} pointerEvents="none">
            <Facet color={c.brand} size={220} />
          </View>

          <Animated.View style={[styles.card, { backgroundColor: c.card }, elevation(c, 2), cardStyle]}>
            <View style={[styles.cardAccent, { backgroundColor: c.gold }]} />
            <Animated.View style={[{ gap: 2 }, rise(4, 10)]}>
              <View style={styles.eyebrow}>
                <Sparkle size={11} color={c.gold} />
                <Text style={[type.small, styles.eyebrowText, { color: c.gold }]}>{greeting().toUpperCase()}</Text>
              </View>
              <Text style={[type.title, { color: c.text, fontSize: 24, lineHeight: 30 }]}>Welcome back</Text>
              <Text style={[type.body, { color: c.muted }]}>Log in with the Employee ID you use on the punch machine.</Text>
            </Animated.View>

            <Animated.View style={rise(5, 10)}>
              <IdInput
                c={c}
                value={employeeId}
                onChangeText={(t) => {
                  setEmployeeId(t.replace(/\D/g, ""));
                  if (error) setError("");
                }}
                onSubmit={submit}
                inputRef={inputRef}
                error={Boolean(error)}
                reduced={reduced}
              />
            </Animated.View>

            <ErrorText error={error} />
            <Animated.View style={rise(6, 10)}>
              <ShimmerButton c={c} title="Log in" onPress={submit} loading={busy} disabled={!employeeId} reduced={reduced} />
            </Animated.View>
          </Animated.View>

          <View style={styles.perks}>
            {PERKS.map(([icon, text, tone], i) => (
              <Animated.View key={text} style={[styles.perk, rise(7 + i, 12)]}>
                <IconCircle name={icon} tone={tone} size={34} />
                <Text style={[type.label, { color: c.text, flex: 1 }]}>{text}</Text>
              </Animated.View>
            ))}
          </View>

          <Animated.View style={[styles.footer, rise(STEPS - 1, 8)]}>
            <Ionicons name={DEMO ? "flask-outline" : "help-circle-outline"} size={14} color={DEMO ? c.warn : c.faint} />
            <Text style={[type.small, { color: DEMO ? c.warn : c.faint, textAlign: "center", flexShrink: 1 }]}>
              {DEMO ? "Demo mode: sample data, any ID works." : "Forgot your ID? It is on your punch card, or ask HR."}
            </Text>
          </Animated.View>
        </View>
      </ScrollView>

      {introDone ? null : (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
          {measured ? (
            <>
              <Animated.View style={[styles.curtain, { backgroundColor: c.brand }, curtainStyle]}>
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: move.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0] }) }]}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <RadialGradient id="glow" cx="50%" cy={`${(50 * areaH) / curtainH}%`} r="70%">
                        <Stop offset="0" stopColor={c.brand} stopOpacity="1" />
                        <Stop offset="1" stopColor={edge} stopOpacity="1" />
                      </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
                  </Svg>
                </Animated.View>
              </Animated.View>

              <View style={[styles.introSlot, { top: slotY }]}>
                <Animated.View style={[styles.introGroup, introGroupStyle]}>
                  <Animated.View style={[styles.ring, ringStyle]}>
                    <Svg width={RING} height={RING}>
                      <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.12)" strokeWidth={1} fill="none" />
                      <AnimatedCircle
                        cx={RING / 2}
                        cy={RING / 2}
                        r={RING_R}
                        stroke={GOLD}
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${RING_LEN} ${RING_LEN}`}
                        strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [RING_LEN, 0] })}
                      />
                    </Svg>
                    {RING_GLINTS.map(([deg, size], i) => {
                      const a = (deg * Math.PI) / 180;
                      const start = i * 0.18;
                      const t = glint.interpolate({
                        inputRange: [0, start, start + 0.3, Math.min(start + 0.6, 1)],
                        outputRange: [0, 0, 1, 0],
                        extrapolate: "clamp"
                      });
                      return (
                        <Animated.View
                          key={i}
                          style={{
                            position: "absolute",
                            left: RING / 2 + RING_R * Math.cos(a) - size / 2,
                            top: RING / 2 + RING_R * Math.sin(a) - size / 2,
                            opacity: t,
                            transform: [{ scale: t }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }]
                          }}
                        >
                          <Sparkle size={size} color="#FFFFFF" />
                        </Animated.View>
                      );
                    })}
                  </Animated.View>
                  <LogoMark c={c} style={[logoStyle, { marginBottom: 0 }]} hStyle={hStyle} rStyle={rStyle} shine={shine} label={false} />
                </Animated.View>
              </View>
            </>
          ) : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl + space.xxl,
    borderBottomLeftRadius: HERO_CORNER,
    borderBottomRightRadius: HERO_CORNER,
    overflow: "hidden"
  },
  bubble: { position: "absolute", backgroundColor: "rgba(255,255,255,0.09)" },
  logo: {
    width: BOX,
    height: BOX,
    borderRadius: 30,
    backgroundColor: "#FFFFFF", // the logo's colours need white, also in dark mode
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md
  },
  logoImage: { width: MARK, height: MARK },
  logoPiece: { position: "absolute", top: 0, height: MARK, overflow: "hidden" },
  shineClip: { ...StyleSheet.absoluteFillObject, borderRadius: 30, overflow: "hidden" },
  shine: { position: "absolute", top: -BOX / 2, left: BOX / 2 - 20, width: 40, height: BOX * 2 },
  title: { flexDirection: "row", justifyContent: "center", width: "100%" },
  tagline: { flexDirection: "row", alignItems: "center", gap: space.sm },
  taglineText: { color: GOLD, letterSpacing: 3, fontWeight: "700" },
  rule: { width: 28, height: 1.5, borderRadius: 1, backgroundColor: GOLD },
  curtain: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: HERO_CORNER,
    borderBottomRightRadius: HERO_CORNER,
    overflow: "hidden"
  },
  introSlot: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  introGroup: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", left: (BOX - RING) / 2, top: (BOX - RING) / 2, width: RING, height: RING },
  body: { flex: 1, paddingHorizontal: space.lg, marginTop: -space.xxl - space.md, gap: space.xl },
  facet: { position: "absolute", right: -50, bottom: 10, opacity: 0.06 },
  card: { borderRadius: radius.hero, padding: space.xl, gap: space.lg, overflow: "visible" },
  cardAccent: { position: "absolute", top: 0, alignSelf: "center", width: 44, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  eyebrowText: { letterSpacing: 1.6, fontWeight: "700" },
  idBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    borderRadius: radius.control,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    overflow: "hidden"
  },
  idLabel: { position: "absolute", left: 0 },
  idText: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
    paddingTop: 18,
    paddingBottom: 4,
    ...Platform.select({ web: { outlineStyle: "none" }, default: {} })
  },
  idLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  goBtn: { minHeight: 54, borderRadius: radius.control, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  goShineClip: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: radius.control },
  goShine: { position: "absolute", top: -30, left: 0, width: 60, height: 120 },
  goInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  goArrow: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  perks: { gap: space.md, paddingHorizontal: space.xs },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.md }
});
