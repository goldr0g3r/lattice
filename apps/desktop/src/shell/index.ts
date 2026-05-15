/**
 * Barrel for the v0.2 PR #3.5 desktop-shell components. The components
 * themselves are intentionally tiny and self-documenting; the locked design
 * decisions live at the top of `WorkspaceShell.tsx`.
 */

export { Sidebar, type SidebarProps } from "./Sidebar";
export { NoteList, type NoteListProps } from "./NoteList";
export { EditorPane, type EditorPaneProps, type SaveStatus } from "./EditorPane";
export { EmptyVault, type EmptyVaultProps } from "./EmptyVault";
export { WorkspaceShell, type WorkspaceShellProps } from "./WorkspaceShell";
export {
  NAV_ITEMS,
  countWords,
  extractSnippet,
  formatLatticeError,
  formatRelativeMs,
  type NavId,
  type NavItem,
} from "./types";
