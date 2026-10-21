import {tokens} from './tokens';

export type ResolvedTheme = 'dark' | 'light';
export type ThemeVars = Record<`--${string}`, string>;

const {colors, motion} = tokens;

const fonts = {
  '--fontMono':
    "'JetBrains Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace",
  '--fontBody': "'Nunito Sans', system-ui, sans-serif",
  '--fontDisplay': "'MuseoModerno', 'Nunito Sans', sans-serif",
  '--motionBase': motion.base,
  '--easing': motion.easing,
};

const dark: ThemeVars = {
  '--page': colors.pageDark,
  '--drawer': colors.drawerDark,
  '--surface': colors.surfaceDark,
  '--deep': '#081626',
  '--border': colors.borderDark,
  '--active': '#0f2f4a',
  '--text': colors.textDarkPrimary,
  '--text2': '#c9d6e3',
  '--muted': colors.textDarkMuted,
  '--faint': colors.mutedBlueDark,
  '--strong': colors.white,
  '--accent': colors.lightBlue,
  '--onAccent': colors.darkBlue,
  '--accentText': colors.lightBlue,
  '--info': colors.lightBlue,
  '--ok': colors.successGreen,
  '--warn': colors.amber,
  '--err': colors.errorRed,
  '--syString': tokens.syntax.dark.string,
  '--syTitle': tokens.syntax.dark.title,
  '--syAttr': tokens.syntax.dark.attr,
  '--syKeyword': tokens.syntax.dark.keyword,
  '--syComment': tokens.syntax.dark.comment,
  '--syNumber': tokens.syntax.dark.number,
  '--diffAddBg': '#0d3a1c66',
  '--diffDelBg': '#3d111466',
  '--diffDelFg': '#ffa198',
  '--badgeWarn': '#3a2a0a',
  '--badgeReview': '#2a2347',
  '--badgeOk': '#0d3a1c',
  '--badgeErr': '#3d1114',
  '--badgeMerged': '#122c44',
  ...fonts,
};

const light: ThemeVars = {
  '--page': colors.pageLight,
  '--drawer': colors.fillSubtle,
  '--surface': colors.white,
  '--deep': colors.fillActive,
  '--border': colors.borderPanelLight,
  '--active': '#e6f0fa',
  '--text': colors.textStrong,
  '--text2': colors.textBody,
  '--muted': colors.textMuted,
  '--faint': colors.textFaint,
  '--strong': colors.navy,
  '--accent': colors.lightBlue,
  '--onAccent': colors.darkBlue,
  '--accentText': '#1d4ed8',
  '--info': '#1d4ed8',
  '--ok': '#15803d',
  '--warn': colors.amberDeep,
  '--err': '#dc2626',
  '--syString': tokens.syntax.light.string,
  '--syTitle': tokens.syntax.light.title,
  '--syAttr': tokens.syntax.light.attr,
  '--syKeyword': tokens.syntax.light.keyword,
  '--syComment': tokens.syntax.light.comment,
  '--syNumber': tokens.syntax.light.number,
  '--diffAddBg': '#dcfce7',
  '--diffDelBg': '#fee2e2',
  '--diffDelFg': '#b91c1c',
  '--badgeWarn': colors.amberSoft,
  '--badgeReview': '#ede9fe',
  '--badgeOk': '#dcfce7',
  '--badgeErr': '#fee2e2',
  '--badgeMerged': colors.borderLight,
  ...fonts,
};

export const themeVars = (theme: ResolvedTheme): ThemeVars =>
  theme === 'dark' ? dark : light;

export const applyTheme = (
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void => {
  for (const [name, value] of Object.entries(themeVars(theme))) {
    root.style.setProperty(name, value);
  }
  root.dataset['theme'] = theme;
};
