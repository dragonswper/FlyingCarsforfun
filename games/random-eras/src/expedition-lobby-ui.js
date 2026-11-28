export function createExpeditionLobby(
  { party, config, name, appearance = () => ({}), onClose },
  root = document,
) {
  const dialog = root.createElement("dialog");
  dialog.id = "coop-dialog";
  dialog.className = "game-modal";
  dialog.innerHTML = `<div class="modal-card"><h2>Co-op Expedition</h2><p>Two to four players defend one core. The host runs the shared world.</p><label>Player limit<select id="coop-capacity"><option value="2">2 players</option><option value="3">3 players</option><option value="4" selected>4 players</option></select></label><label>Connection<select id="coop-transport"><option value="internet">Different computers</option><option value="local">Two tabs on this device</option></select></label><div class="screen-actions"><button id="coop-host" type="button">Host Expedition</button><button id="coop-new-invite" type="button" disabled>Create friend invite</button></div><label>Invite seat<select id="coop-seat"></select></label><label>Code to share<textarea id="coop-output" readonly rows="3" aria-label="Co-op invite or response code"></textarea></label><button id="coop-copy" type="button">Copy code</button><label>Code from your friend<textarea id="coop-input" rows="3" maxlength="65536"></textarea></label><div class="screen-actions"><button id="coop-answer" type="button">Apply response to selected seat</button><button id="coop-join" type="button">Join using invite</button></div><ul id="coop-roster"></ul><p id="coop-status" role="status"></p><button id="coop-start" type="button" disabled>Start shared Expedition</button><button id="coop-close" type="button">Back</button><button id="coop-reset" type="button">Leave / reset lobby</button><p class="modal-note">Send a separate invite to each friend, then apply their response to its matching seat. Direct connections depend on both networks; restrictive networks may need a different connection.</p></div>`;
  root.body.append(dialog);
  const $ = (id) => root.getElementById(id);
  const offers = new Map();
  let busy = false;
  function render(text) {
    if (text) $("coop-status").textContent = text;
    $("coop-roster").replaceChildren(
      ...party.members().map((member) => {
        const li = root.createElement("li");
        li.textContent = `${member.name} · ${member.connected ? "Connected" : "Waiting"}`;
        return li;
      }),
    );
    $("coop-start").disabled =
      busy ||
      party.role !== "host" ||
      party.members().length < 2 ||
      !party.connected;
    $("coop-new-invite").disabled =
      busy || party.role !== "host" || party.started;
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    render();
    try {
      await fn();
    } catch (error) {
      $("coop-status").textContent = error.message;
    } finally {
      busy = false;
      render();
    }
  }
  $("coop-host").addEventListener("click", () =>
    action(async () => {
      offers.clear();
      $("coop-seat").replaceChildren();
      await party.host(
        config(),
        Number($("coop-capacity").value),
        name(),
        appearance(),
      );
      render("Lobby created. Create one invite per friend.");
    }),
  );
  $("coop-new-invite").addEventListener("click", () =>
    action(async () => {
      const offer = await party.invite(
        $("coop-transport").value === "local" ? "local" : undefined,
      );
      offers.set(offer.id, offer.code);
      $("coop-seat").add(new Option(offer.id, offer.id));
      $("coop-seat").value = offer.id;
      $("coop-output").value = offer.code;
      render(
        "Send this invite to one friend. Paste their response below, then apply it to this seat.",
      );
    }),
  );
  $("coop-seat").addEventListener("change", () => {
    $("coop-output").value = offers.get($("coop-seat").value) || "";
  });
  $("coop-answer").addEventListener("click", () =>
    action(() => party.answer($("coop-seat").value, $("coop-input").value)),
  );
  $("coop-join").addEventListener("click", () =>
    action(async () => {
      $("coop-output").value = await party.join(
        $("coop-input").value,
        name(),
        appearance(),
      );
      render("Send the response above back to the host.");
    }),
  );
  $("coop-start").addEventListener("click", () => action(() => party.start()));
  $("coop-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("coop-output").value);
      render("Code copied.");
    } catch {
      $("coop-output").select();
      render("Code selected. Copy it using your browser.");
    }
  });
  $("coop-close").addEventListener("click", () => dialog.close());
  $("coop-reset").addEventListener("click", () => {
    party.close();
    offers.clear();
    $("coop-seat").replaceChildren();
    $("coop-output").value = "";
    render("Lobby reset.");
    onClose?.();
  });
  return {
    dialog,
    render,
    open() {
      render();
      dialog.showModal();
    },
    close() {
      dialog.close();
    },
  };
}
