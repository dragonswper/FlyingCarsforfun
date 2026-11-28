const CODE_VERSION = "RE5";
const CHANNEL_LABEL = "random-eras-arena";
const ICE_TIMEOUT = 7_000;
const MAX_CODE_LENGTH = 24_000;
const MAX_MESSAGE_LENGTH = 32_000;
const MAX_BUFFERED_AMOUNT = 64_000;
const LOCAL_TIMEOUT = 4_000;
const ID_PATTERN = /^[a-f0-9]{24}$/;

const ICE_SERVERS = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

function assertVersion(version) {
  if (/^RE\d+$/.test(version) && version !== CODE_VERSION) {
    throw new Error(
      "This invite uses another build. Refresh the game on both devices and make a new invite.",
    );
  }
}

const toBase64 = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export async function encodeDescription(description, sessionId) {
  const bytes = new TextEncoder().encode(description.sdp);
  let payload = "u" + toBase64(bytes);
  if (typeof CompressionStream !== "undefined") {
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    if (compressed.byteLength < bytes.length)
      payload = "g" + toBase64(new Uint8Array(compressed));
  }
  return `${CODE_VERSION}.${description.type}.${sessionId}.${payload}`;
}

async function inflate(bytes) {
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const buffer = new Uint8Array(MAX_CODE_LENGTH);
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return buffer.subarray(0, size);
      if (value.length + size > buffer.length)
        throw new Error("Invite is too large.");
      buffer.set(value, size);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function decodeDescription(code, expectedType) {
  const label = expectedType === "offer" ? "invite" : "response";
  const invalidCode = () =>
    new Error(`Paste the complete Arena ${label} code.`);
  if (typeof code !== "string" || code.length > MAX_CODE_LENGTH)
    throw invalidCode();

  const [version, type, sessionId, encoded, extra] = code
    .replace(/\s/g, "")
    .split(".");
  assertVersion(version);
  if (
    version !== CODE_VERSION ||
    type !== expectedType ||
    extra !== undefined ||
    !ID_PATTERN.test(sessionId ?? "") ||
    !/^[gu][\w-]+$/.test(encoded ?? "")
  ) {
    throw invalidCode();
  }

  let sdp;
  try {
    const binary = atob(
      encoded.slice(1).replaceAll("-", "+").replaceAll("_", "/"),
    );
    let data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (encoded[0] === "g") data = await inflate(data);
    sdp = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw invalidCode();
  }

  if (
    !sdp.startsWith("v=0") ||
    !/^m=application /m.test(sdp) ||
    !/^a=candidate:/m.test(sdp)
  ) {
    throw invalidCode();
  }
  return { description: { type, sdp }, sessionId };
}

export function smoothRemoteMovement(current, input, age, step) {
  const fade = Math.max(0, Math.min(1, (420 - age) / 220));
  const blend = 1 - Math.exp(-step * 24);
  const axis = (value) =>
    Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  current.moveX += (axis(input.moveX) * fade - current.moveX) * blend;
  current.moveZ += (axis(input.moveZ) * fade - current.moveZ) * blend;
  return current;
}

function waitForCandidates(peer, signal) {
  if (peer.iceGatheringState === "complete" || signal.aborted)
    return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", update);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const update = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, ICE_TIMEOUT);
    peer.addEventListener("icegatheringstatechange", update);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function isMessage(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function parseMessage(data) {
  if (typeof data !== "string" || data.length > MAX_MESSAGE_LENGTH) return null;
  try {
    const message = JSON.parse(data);
    return isMessage(message) && typeof message.type === "string"
      ? message
      : null;
  } catch {
    return null;
  }
}

function serializeMessage(message) {
  if (!isMessage(message)) return null;
  try {
    const payload = JSON.stringify(message);
    return typeof payload === "string" && payload.length <= MAX_MESSAGE_LENGTH
      ? payload
      : null;
  } catch {
    return null;
  }
}

function createWebRtcSession(
  role,
  { onMessage = () => {}, onStatus = () => {} } = {},
) {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("Online Arena requires a browser with WebRTC support.");
  }

  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const lifetime = new AbortController();
  let status = "idle";
  let channel;
  let sessionId;

  function setStatus(next, detail) {
    if (status === next || status === "closed") return;
    status = next;
    onStatus(status, detail);
  }

  function attachChannel(dataChannel) {
    if (channel || dataChannel.label !== CHANNEL_LABEL) {
      dataChannel.close();
      return;
    }

    channel = dataChannel;
    channel.addEventListener("open", () => setStatus("connected"));
    channel.addEventListener("close", () => {
      if (status !== "failed") setStatus("disconnected");
    });
    channel.addEventListener("error", () =>
      setStatus("failed", "The Arena connection failed."),
    );
    channel.addEventListener("message", ({ data }) => {
      if (status === "closed") return;
      const message = parseMessage(data);
      if (message) onMessage(message);
    });
    if (channel.readyState === "open") setStatus("connected");
  }

  peer.addEventListener("connectionstatechange", () => {
    if (
      peer.connectionState === "connected" &&
      channel?.readyState === "open"
    ) {
      setStatus("connected");
    } else if (peer.connectionState === "disconnected") {
      setStatus("disconnected");
    } else if (peer.connectionState === "failed") {
      setStatus(
        "failed",
        "The peers could not connect. Try a new invite or a different network.",
      );
    }
  });

  if (role === "host") {
    attachChannel(peer.createDataChannel(CHANNEL_LABEL));
  } else {
    peer.addEventListener("datachannel", ({ channel: openedChannel }) =>
      attachChannel(openedChannel),
    );
  }

  async function gatherDescription(createDescription) {
    setStatus("gathering");
    try {
      const description = await createDescription();
      await peer.setLocalDescription(description);
      await waitForCandidates(peer, lifetime.signal);
      if (lifetime.signal.aborted)
        throw new Error("The Arena session was closed.");
      if (!/^a=candidate:/m.test(peer.localDescription?.sdp ?? "")) {
        throw new Error(
          "No connection addresses were found. Try a different network.",
        );
      }

      const code = await encodeDescription(peer.localDescription, sessionId);
      setStatus("waiting");
      return code;
    } catch (error) {
      setStatus("failed", error.message);
      throw error;
    }
  }

  const session = {
    transport: "webrtc",
    get status() {
      return status;
    },
    send(message) {
      if (
        status !== "connected" ||
        channel?.readyState !== "open" ||
        channel.bufferedAmount > MAX_BUFFERED_AMOUNT
      )
        return false;
      const payload = serializeMessage(message);
      if (!payload) return false;

      try {
        channel.send(payload);
        return true;
      } catch {
        return false;
      }
    },
    close() {
      if (status === "closed") return;
      setStatus("closed");
      lifetime.abort();
      channel?.close();
      peer.close();
    },
  };

  if (role === "host") {
    session.createInvite = async () => {
      if (status !== "idle")
        throw new Error("Start a new Arena session to create another invite.");
      sessionId = createId();
      return gatherDescription(() => peer.createOffer());
    };
    session.acceptAnswer = async (code) => {
      if (status !== "waiting")
        throw new Error("Create an Arena invite before applying a response.");
      const answer = await decodeDescription(code, "answer");
      if (answer.sessionId !== sessionId)
        throw new Error("This response belongs to a different Arena invite.");

      setStatus("connecting");
      try {
        await peer.setRemoteDescription(answer.description);
      } catch {
        setStatus("waiting");
        throw new Error(
          "The browser could not open this response. Ask your opponent to copy it again.",
        );
      }
    };
  } else {
    session.acceptInvite = async (code) => {
      if (status !== "idle")
        throw new Error("Start a new Arena session to join another invite.");
      const offer = await decodeDescription(code, "offer");
      sessionId = offer.sessionId;
      return gatherDescription(async () => {
        await peer.setRemoteDescription(offer.description);
        return peer.createAnswer();
      });
    };
  }

  return session;
}

function decodeLocalCode(code, expectedType) {
  const label = expectedType === "local-offer" ? "invite" : "response";
  if (typeof code !== "string" || code.length > MAX_CODE_LENGTH) {
    throw new Error(`Paste the complete local Arena ${label} code.`);
  }
  const [version, type, sessionId, guestId, extra] = code
    .replace(/\s/g, "")
    .split(".");
  assertVersion(version);
  const validGuestId =
    expectedType === "local-answer"
      ? ID_PATTERN.test(guestId ?? "")
      : guestId === undefined;
  if (
    version !== CODE_VERSION ||
    type !== expectedType ||
    !ID_PATTERN.test(sessionId ?? "") ||
    !validGuestId ||
    extra !== undefined
  ) {
    throw new Error(`Paste the complete local Arena ${label} code.`);
  }
  return { sessionId, guestId };
}

function createLocalSession(
  role,
  { onMessage = () => {}, onStatus = () => {} } = {},
) {
  if (typeof BroadcastChannel === "undefined") {
    throw new Error("Local Arena requires a current browser.");
  }

  let status = "idle";
  let sessionId;
  let guestId;
  let channel;
  let connectionTimer;

  function setStatus(next, detail) {
    if (status === next || status === "closed") return;
    status = next;
    onStatus(status, detail);
  }

  function sendEnvelope(type, payload) {
    channel.postMessage({ type, role, guestId, payload });
  }

  function openChannel() {
    channel = new BroadcastChannel(`${CHANNEL_LABEL}:${sessionId}`);
    channel.addEventListener("message", ({ data }) => {
      if (
        !data ||
        status === "closed" ||
        data.role === role ||
        data.guestId !== guestId
      )
        return;

      if (data.type === "open" && role === "guest" && status === "waiting") {
        sendEnvelope("ready");
        setStatus("connected");
      } else if (
        data.type === "ready" &&
        role === "host" &&
        status === "connecting"
      ) {
        clearTimeout(connectionTimer);
        setStatus("connected");
      } else if (data.type === "data" && status === "connected") {
        const message = parseMessage(data.payload);
        if (message) onMessage(message);
      } else if (data.type === "close" && status === "connected") {
        setStatus("disconnected");
      }
    });
  }

  function close() {
    if (status === "closed") return;
    if (status === "connected") sendEnvelope("close");
    clearTimeout(connectionTimer);
    channel?.close();
    globalThis.removeEventListener?.("pagehide", close);
    setStatus("closed");
  }

  globalThis.addEventListener?.("pagehide", close, { once: true });
  const session = {
    transport: "local",
    get status() {
      return status;
    },
    send(message) {
      if (status !== "connected") return false;
      const payload = serializeMessage(message);
      if (!payload) return false;
      sendEnvelope("data", payload);
      return true;
    },
    close,
  };

  if (role === "host") {
    session.createInvite = async () => {
      if (status !== "idle")
        throw new Error("Start a new Arena session to create another invite.");
      sessionId = createId();
      openChannel();
      setStatus("waiting");
      return `${CODE_VERSION}.local-offer.${sessionId}`;
    };
    session.acceptAnswer = async (code) => {
      if (status !== "waiting")
        throw new Error("Create an Arena invite before applying a response.");
      const answer = decodeLocalCode(code, "local-answer");
      if (answer.sessionId !== sessionId)
        throw new Error("This response belongs to a different Arena invite.");

      guestId = answer.guestId;
      setStatus("connecting");
      sendEnvelope("open");
      connectionTimer = setTimeout(() => {
        setStatus(
          "waiting",
          "Open the other tab in the same browser and try the response again.",
        );
      }, LOCAL_TIMEOUT);
    };
  } else {
    session.acceptInvite = async (code) => {
      if (status !== "idle")
        throw new Error("Start a new Arena session to join another invite.");
      ({ sessionId } = decodeLocalCode(code, "local-offer"));
      guestId = createId();
      openChannel();
      setStatus("waiting");
      return `${CODE_VERSION}.local-answer.${sessionId}.${guestId}`;
    };
  }

  return session;
}

export function createHostSession(options = {}) {
  return options.transport === "local"
    ? createLocalSession("host", options)
    : createWebRtcSession("host", options);
}

export function createGuestSession(options = {}) {
  let session;
  let closed = false;

  return {
    get transport() {
      return session?.transport;
    },
    get status() {
      return closed ? "closed" : (session?.status ?? "idle");
    },
    async acceptInvite(code) {
      if (closed)
        throw new Error("Start a new Arena session to join another invite.");
      if (typeof code === "string")
        assertVersion(code.slice(0, 12).trim().split(".")[0]);
      const localPrefix = `${CODE_VERSION}.local-offer.`;
      const local =
        typeof code === "string" &&
        code.replace(/\s/g, "").startsWith(localPrefix);
      if (
        !session ||
        (session.status === "idle" && (session.transport === "local") !== local)
      ) {
        const previous = session;
        session = undefined;
        previous?.close();

        const createTransport = local
          ? createLocalSession
          : createWebRtcSession;
        const selected = createTransport("guest", {
          ...options,
          onStatus(status, detail) {
            if (session === selected) options.onStatus?.(status, detail);
          },
        });
        session = selected;
      }
      return session.acceptInvite(code);
    },
    send(message) {
      return session?.send(message) ?? false;
    },
    close() {
      if (closed) return;
      closed = true;
      if (session) session.close();
      else options.onStatus?.("closed");
    },
  };
}
