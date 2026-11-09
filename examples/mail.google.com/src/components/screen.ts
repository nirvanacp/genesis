/**
 * The params of the screen a component belongs to. A sheet keeps the screen it opened from
 * rendered behind it, and while the sheet is current the navigation's screen is the sheet, so
 * the screen behind reads its own params from here instead.
 */
import { createContext, useContext } from "react";
import { useNavigation } from "@genesis/sdk/react";

export const ScreenParams = createContext<Record<string, string> | null>(null);

export function useScreenParams(): Record<string, string> {
  const own = useContext(ScreenParams);
  const { screen } = useNavigation();
  return own ?? screen?.params ?? {};
}
