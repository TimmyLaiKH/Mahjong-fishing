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

/** PeerJS's binary packer rejects non-finite numbers (real win results carry
 *  `fanCap: Infinity`) and anything other than plain data. Normalise every
 *  outgoing message here so one bad value cannot silently kill a 胡 notice. */
export function networkSafe(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(networkSafe);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if (value.constructor === Object || value.constructor === undefined) {
      const plain = {};
      for (const [key, item] of Object.entries(value)) plain[key] = networkSafe(item);
      return plain;
    }
  }
  return null;
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

  // A dead WebRTC connection must never stop local settlement (especially a
  // 胡): a failed send is dropped here instead of throwing into the win path.
  function deliver(conn, msg) {
    if (!conn?.open) return;
    try { conn.send(networkSafe(msg)); } catch { /* peer disappeared mid-send */ }
  }

  function sendToHost(msg) {
    deliver(hostConn, msg);
  }

  /** Host-only: send a direct ruling (e.g. a rejected catch) to one seat. */
  function sendToPeer(peerId, msg) {
    if (!hosting) return;
    deliver(guests.get(peerId), msg);
  }

  function broadcast(msg, exceptPeerId = null) {
    for (const [peerId, conn] of guests) {
      if (peerId !== exceptPeerId) deliver(conn, msg);
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
