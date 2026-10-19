// TODO(fly): replace with @heronlabs/design-system once published
const hexToRgbTriplet = (hex: string): string => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
};

const lightBlue = '#39b3f8';
const successGreen = '#1fd646';
const navy = '#0a2540';
const darkBlue = '#042139';
const amber = '#f59e0b';
const amberDeep = '#c2410c';
const textDarkPrimary = '#dde7ef';

const breakpointSizes = {
  mobileExtraSmall: '320px',
  mobileSmall: '400px',
  mobile: '475px',
  tablet: '768px',
  desktopSmall: '1024px',
  desktop: '1280px',
  desktopLarge: '1536px',
};

export const tokens = {
  colors: {
    lighterBlue: '#13c2c2',
    lightBlue,
    lightBlueRgb: hexToRgbTriplet(lightBlue),
    brandBlue: '#2396ed',
    lime: '#CCDA3D',
    successGreen,
    successGreenRgb: hexToRgbTriplet(successGreen),
    errorRed: '#ff3026',
    white: '#FFFFFF',
    black: '#080808',
    darkBlue,
    darkBlueRgb: hexToRgbTriplet(darkBlue),
    darkerBlue: '#04101a',
    softGrey: '#fafafa',
    borderGrey: '#e5e5e5',
    navy,
    navyRgb: hexToRgbTriplet(navy),
    pageDark: '#051528',
    surfaceDark: '#0c2236',
    drawerDark: '#0a1a2c',
    borderDark: '#133452',
    borderDarkScrolled: '#1a3d5e',
    borderPanelDark: 'rgba(255, 255, 255, 0.09)',
    amber,
    amberRgb: hexToRgbTriplet(amber),
    amberDeep,
    amberDeepRgb: hexToRgbTriplet(amberDeep),
    amberSoft: '#fff3ea',
    pageLight: '#fbfcfd',
    fillSubtle: '#f6f8fa',
    fillActive: '#f3f6f9',
    fillHover: '#eef1f4',
    borderField: '#cfe0ee',
    borderLight: '#e5e7eb',
    borderPanelLight: '#e8edf2',
    textDarkPrimary,
    textDarkPrimaryRgb: hexToRgbTriplet(textDarkPrimary),
    textDarkMuted: '#8aa8c8',
    mutedBlue: '#5480b0',
    mutedBlueDark: '#5e8fc0',
    textStrong: '#1f2937',
    textBody: '#374151',
    textMuted: '#6b7280',
    textFaint: '#9ca3af',
  },
  syntax: {
    light: {
      surface: '#f6f8fa',
      header: '#eef1f4',
      border: '#e8edf2',
      label: '#6b7280',
      plain: '#1f2937',
      comment: '#6b7280',
      keyword: amberDeep,
      string: '#15803d',
      number: '#1d4ed8',
      title: '#7c3aed',
      attr: '#0369a1',
    },
    dark: {
      surface: '#0c2236',
      header: '#0a1a2c',
      border: '#133452',
      label: '#8aa8c8',
      plain: textDarkPrimary,
      comment: '#8aa8c8',
      keyword: amber,
      string: '#86efac',
      number: lightBlue,
      title: '#c4b5fd',
      attr: '#7dd3fc',
    },
  },
  motion: {
    micro: '120ms',
    base: '200ms',
    drawer: '320ms',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  radii: {
    field: '11px',
    control: '10px',
    card: '16px',
    panel: '20px',
    sheet: '24px',
  },
  shadows: {
    card: '0 1px 2px rgb(4 33 57 / 6%), 0 1px 3px rgb(4 33 57 / 4%)',
    cardHover: '0 14px 32px -16px rgb(4 33 57 / 34%)',
    sheet: '0 32px 72px -28px rgb(4 33 57 / 30%)',
    sheetDark: '0 32px 72px -28px rgb(0 0 0 / 70%)',
  },
  layout: {
    headerReserve: '105px',
    sidebarWidth: '264px',
    capsuleMaxWidth: '1060px',
    contentMaxWidth: '1280px',
    pillRadius: '999px',
  },
  breakpointSizes,
  breakpoints: {
    mobileExtraSmall: `@media (min-width: ${breakpointSizes.mobileExtraSmall})`,
    mobileSmall: `@media (min-width: ${breakpointSizes.mobileSmall})`,
    mobile: `@media (min-width: ${breakpointSizes.mobile})`,
    tablet: `@media (min-width: ${breakpointSizes.tablet})`,
    desktopSmall: `@media (min-width: ${breakpointSizes.desktopSmall})`,
    desktop: `@media (min-width: ${breakpointSizes.desktop})`,
    desktopLarge: `@media (min-width: ${breakpointSizes.desktopLarge})`,
  },
  zIndexes: {
    menuHorizontal: 1000,
    menuVertical: 1001,
    homeBannerDashboard: 999,
  },
  transitions: {
    theme: '0.5s ease-in-out',
  },
  fluid: {
    textXs: 'clamp(11px, 10px + 0.25vw, 13px)',
    textSm: 'clamp(12px, 11px + 0.35vw, 15px)',
    textBase: 'clamp(14px, 12.5px + 0.5vw, 17px)',
    textMd: 'clamp(15px, 13px + 0.6vw, 19px)',
    textLg: 'clamp(18px, 15px + 1vw, 24px)',
    textXl: 'clamp(22px, 17px + 1.6vw, 32px)',
    titleHero: 'clamp(32px, 22px + 3vw, 56px)',
    spaceXs: 'clamp(6px, 5px + 0.4vmin, 10px)',
    spaceSm: 'clamp(10px, 8px + 0.8vmin, 16px)',
    spaceMd: 'clamp(16px, 12px + 1.6vmin, 28px)',
    spaceLg: 'clamp(24px, 16px + 2.8vmin, 48px)',
    spaceXl: 'clamp(40px, 28px + 5vmin, 88px)',
  },
};

export type ThemeAccent = 'blue' | 'amber';

export type AccentPalette = {
  primary: string;
  primaryRgb: string;
  onPrimary: string;
  soft: string;
};

export const getAccentPalette = (
  lightMode: boolean,
  accent: ThemeAccent,
): AccentPalette => {
  if (accent === 'amber') {
    return {
      primary: lightMode ? tokens.colors.amberDeep : tokens.colors.amber,
      primaryRgb: lightMode
        ? tokens.colors.amberDeepRgb
        : tokens.colors.amberRgb,
      onPrimary: lightMode ? tokens.colors.white : tokens.colors.darkerBlue,
      soft: lightMode
        ? tokens.colors.amberSoft
        : `rgb(${tokens.colors.amberRgb} / 14%)`,
    };
  }

  return {
    primary: lightMode ? tokens.colors.darkBlue : tokens.colors.lightBlue,
    primaryRgb: lightMode
      ? tokens.colors.darkBlueRgb
      : tokens.colors.lightBlueRgb,
    onPrimary: lightMode ? tokens.colors.white : tokens.colors.darkBlue,
    soft: lightMode ? tokens.colors.fillSubtle : 'rgb(255 255 255 / 8%)',
  };
};
