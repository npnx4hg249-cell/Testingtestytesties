/**
 * Theme colors for dark mode support.
 * Use these instead of hardcoded hex colors in inline styles.
 *
 * Usage:
 *   const { darkMode } = useAuth();
 *   const t = theme(darkMode);
 *   <div style={{ background: t.bgMuted, color: t.textMuted }}>
 */
export default function theme(darkMode) {
  if (darkMode) {
    return {
      // Backgrounds
      bgMuted: '#1a1a2e',       // replaces #f5f5f5
      bgSurface: '#1f2940',     // replaces #fff
      bgHover: '#253352',       // replaces #fafafa
      bgHighlight: '#1a3a5c',   // replaces #e3f2fd (blue highlight)
      bgWarnLight: '#3d2e0f',   // replaces #fff3e0 (orange tint)
      bgSuccessLight: '#1a2e1a',// replaces #e8f5e9, #c8e6c9
      bgErrorLight: '#2e1a1a',  // replaces #ffcdd2
      bgInfoLight: '#1a2a3e',   // replaces #b3e5fc, #bbdefb
      bgTraining: '#2a1f3d',    // replaces #e6cff2
      bgDraftWarn: '#2e2a0f',   // replaces #fff3cd
      bgRowAlt: 'rgba(255,255,255,0.03)',
      bgCode: '#161b2e',        // replaces #fff for code blocks

      // Text
      text: '#e8e8e8',          // replaces #000, #333
      textMuted: '#a0a0a0',     // replaces #666
      textFaint: '#707070',     // replaces #999, #aaa, #ccc
      textAccent: '#64b5f6',    // replaces #1565c0
      textError: '#ff6b6b',     // replaces #c62828
      textTraining: '#ce93d8',  // replaces #9c27b0

      // Borders
      border: '#3a4a6b',        // replaces #ddd, #eee
      borderStrong: '#4a5a7b',  // replaces #ccc
      borderSep: '#2a3a5b',     // replaces #e0e0e0, #f0f0f0

      // Row backgrounds for tables
      rowOff: 'rgba(255,255,255,0.02)',
      rowUnavail: 'rgba(255,255,255,0.01)',
      rowWeekend: 'rgba(100,181,246,0.06)',
    };
  }

  return {
    // Backgrounds
    bgMuted: '#f5f5f5',
    bgSurface: '#fff',
    bgHover: '#fafafa',
    bgHighlight: '#e3f2fd',
    bgWarnLight: '#fff3e0',
    bgSuccessLight: '#e8f5e9',
    bgErrorLight: '#ffcdd2',
    bgInfoLight: '#b3e5fc',
    bgTraining: '#e6cff2',
    bgDraftWarn: '#fff3cd',
    bgRowAlt: 'transparent',
    bgCode: '#fff',

    // Text
    text: '#333',
    textMuted: '#666',
    textFaint: '#999',
    textAccent: '#1565c0',
    textError: '#c62828',
    textTraining: '#9c27b0',

    // Borders
    border: '#ddd',
    borderStrong: '#ccc',
    borderSep: '#e0e0e0',

    // Row backgrounds
    rowOff: '#fafafa',
    rowUnavail: '#f9f9f9',
    rowWeekend: '#f5f8ff',
  };
}
