export const isSpectatorPlayer = player => player?.participation === "spectator";
export const isReadyPlayer = player => player?.readiness === "ready" && !isSpectatorPlayer(player);

export function isSpectatorRow(row, players = window.__fx?.gameSdk?.lobby?.getSnapshot?.()?.players ?? []) {
  if (row?.dataset?.fxLobbyParticipation === "spectator") return true;
  const rowId = String(row?.dataset?.fxPlayerId ?? "");
  const rowName = String(row?.dataset?.fxAccountName ?? "").trim().toLocaleLowerCase();
  return players.some(player => isSpectatorPlayer(player) && (
    (rowId && String(player.id ?? "") === rowId)
    || (rowName && String(player.name ?? "").trim().toLocaleLowerCase() === rowName)
  ));
}
