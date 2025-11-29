/**
 * Layout & Spacing Constants
 * Ensures consistent alignment across all sidebars and content areas
 */

export const LAYOUT_CONSTANTS = {
  // Padding for main sections
  SECTION_PADDING_X: 'px-4',
  SECTION_PADDING_Y: 'py-3',
  
  // Border styles for sections
  SECTION_BORDER_TOP: 'border-t',
  SECTION_BORDER_COLOR_DARK: 'border-slate-700/50',
  SECTION_BORDER_COLOR_LIGHT: 'border-gray-200',
  
  // Background for footer sections
  SECTION_BG_DARK: 'bg-slate-800/50',
  SECTION_BG_LIGHT: 'bg-white/80',
  
  // Input/Message box styles
  INPUT_PADDING_X: 'px-4',
  INPUT_PADDING_Y: 'py-3',
  INPUT_BORDER: 'border',
  INPUT_BORDER_COLOR_DARK: 'border-slate-700',
  INPUT_BORDER_COLOR_LIGHT: 'border-gray-300',
  
  // Message container padding
  MESSAGE_PADDING_X: 'px-4',
  
  // Consistent rounded corners
  ROUND_SM: 'rounded-lg',
  ROUND_MD: 'rounded-xl',
  
  // Spacing between items
  ITEM_GAP: 'gap-2',
} as const;

/**
 * Usage in ChannelSidebar:
 * 
 * <div className={`${LAYOUT_CONSTANTS.SECTION_PADDING_X} ${LAYOUT_CONSTANTS.SECTION_PADDING_Y} 
 *                  ${LAYOUT_CONSTANTS.SECTION_BORDER_TOP} 
 *                  ${isDarkMode ? LAYOUT_CONSTANTS.SECTION_BORDER_COLOR_DARK : LAYOUT_CONSTANTS.SECTION_BORDER_COLOR_LIGHT}
 *                  ${isDarkMode ? LAYOUT_CONSTANTS.SECTION_BG_DARK : LAYOUT_CONSTANTS.SECTION_BG_LIGHT}`}>
 *   Members Section
 * </div>
 * 
 * Usage in Dashboard:
 * 
 * <footer className={`${LAYOUT_CONSTANTS.SECTION_PADDING_X} ${LAYOUT_CONSTANTS.SECTION_PADDING_Y} 
 *                     ${LAYOUT_CONSTANTS.SECTION_BORDER_TOP} 
 *                     ${isDarkMode ? LAYOUT_CONSTANTS.SECTION_BORDER_COLOR_DARK : LAYOUT_CONSTANTS.SECTION_BORDER_COLOR_LIGHT}
 *                     ${isDarkMode ? LAYOUT_CONSTANTS.SECTION_BG_DARK : LAYOUT_CONSTANTS.SECTION_BG_LIGHT}`}>
 */
