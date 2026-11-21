/* ------------------------------------------------------------------ *
 * Minimal PeerJS wrapper for casual, room-code based multiplayer.
 * The host owns the room ID and relays messages, plus the shared fish sea;
 * concealed hands are kept private on each device.
 * ------------------------------------------------------------------ */

const ROOM_PREFIX = 'mf-';

export function roomPeerId(code) {
  return `${ROOM_PREFIX}${String(code).toUpperCase()}`;
}

export function randomPlayerId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createNet() {
  let peer = null;
  let hostConn = null;
  let hosting = false;
  const guests = new Map();
  const listeners = new Map();

  function on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  }

  function emit(type, payload = {}, conn = null) {
    for (const handler of listeners.get(type) ?? []) handler(payload, conn);
  }

  function wireConnection(conn, inbound) {
    conn.on('open', () => emit(inbound ? 'guestOpen' : 'hostOpen', {}, conn));
    conn.on('data', (msg) => {
      if (msg && typeof msg.t === 'string') emit(msg.t, msg, conn);
    });
    conn.on('close', () => {
      if (inbound) {
        guests.delete(conn.peer);
        emit('guestClose', { peerId: conn.peer }, conn);
      } else {
        emit('hostClose', { peerId: conn.peer }, conn);
      }
    });
    conn.on('error', (error) => emit('error', { error }, conn));
  }

  function waitForOpen(target, type, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new Error(type === 'host' ? 'room-timeout' : 'peer-timeout'));
      }, timeoutMs);
      target.once('open', () => finish(resolve));
      target.once('error', (error) => finish(reject, error));
    });
  }

  async function startHost(code) {
    hosting = true;
    peer = new window.Peer(roomPeerId(code), { debug: 0 });
    peer.on('error', (error) => emit('error', { error }));
    peer.on('disconnected', () => peer?.reconnect());
    peer.on('connection', (conn) => {
      guests.set(conn.peer, conn);
      wireConnection(conn, true);
      emit('guestJoin', { peerId: conn.peer }, conn);
    });
    await waitForOpen(peer, 'host', 10000);
    return true;
  }

  async function joinRoom(code, playerId, name = null) {
    hosting = false;
    peer = new window.Peer(undefined, { debug: 0 });
    peer.on('error', (error) => emit('error', { error }));
    peer.on('disconnected', () => peer?.reconnect());
    await waitForOpen(peer, 'peer', 10000);
    hostConn = peer.connect(roomPeerId(code), { reliable: true });
    wireConnection(hostConn, false);
    await waitForOpen(hostConn, 'room', 10000);
    sendToHost({ t: 'join', playerId, name });
    return true;
  }

  function sendToHost(msg) {
    if (hostConn?.open) hostConn.send(msg);
  }

  /** Host-only: send a direct ruling (e.g. a rejected catch) to one seat. */
  function sendToPeer(peerId, msg) {
    if (!hosting) return;
    const conn = guests.get(peerId);
    if (conn?.open) conn.send(msg);
  }

  function broadcast(msg, exceptPeerId = null) {
    for (const [peerId, conn] of guests) {
      if (conn.open && peerId !== exceptPeerId) conn.send(msg);
    }
  }

  function guestCount() { return guests.size; }

  function close() {
    hosting = false;
    guests.clear();
    hostConn = null;
    try { peer?.destroy(); } catch { /* already gone */ }
    peer = null;
  }

  return {
    on, emit, startHost, joinRoom, sendToHost, sendToPeer, broadcast,
    guestCount, close,
    get isHost() { return hosting; },
    get available() { return typeof window.Peer === 'function'; },
  };
}
