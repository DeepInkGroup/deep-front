import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";
import { UserSettings } from "./UserSettings";
import { Platform } from "./Platform";
import {
  WATER_TUNNEL_MAX_RANGE,
  WATER_TUNNEL_MIN_LEVEL,
} from "@openfront/engine/game/WaterTunnel";

@customElement("help-modal")
export class HelpModal extends BaseModal {
  protected routerName = "help";
  protected renderHeaderSlot() {
    return modalHeader({
      title: "How to play",
      onBack: () => this.close(),
      ariaLabel: "Back",
    });
  }
  protected renderBody() {
    const bindings = new UserSettings().keybinds(Platform.isMac);
    const label = (code: string) =>
      code?.replace(/^Key|^Digit/, "").replace(/Left$|Right$/, "") ||
      "Unassigned";
    const shortcuts = [
      ["S1", "Oil Factory"],
      ["S2", "Copper Mine"],
      ["S3", "Logistics Center"],
      ["S4", "Customs Office"],
      ["S5", "Bunker Missile Site"],
      ["S6", "CIWS Defense"],
      ["S7", "EMP Missile"],
      ["S8", "Stealth Missile"],
      ["S9", "Hypersonic Missile"],
      ["S0", "Strait Control Station"],
    ];
    return html`<article class="game-guide">
      <header class="guide-intro">
        <span class="guide-eyebrow">DEEP FRONT / FIELD GUIDE</span>
        <h1>Build an economy. Shape the battlefield.</h1>
        <p>
          Expand your territory, keep your troops supplied, and turn connected
          cities and trade routes into a lasting advantage. Play solo against AI
          or create a multiplayer lobby for friends.
        </p>
      </header>
      <nav
        class="guide-contents"
        aria-label="Guide contents"
        @click=${(event: MouseEvent) => {
          const link = (event.target as HTMLElement).closest("a");
          if (!link) return;
          event.preventDefault();
          this.querySelector(link.hash)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }}
      >
        <a href="#guide-start">Getting started</a
        ><a href="#guide-economy">Economy</a>
        <a href="#guide-trade">Trade &amp; tunnels</a
        ><a href="#guide-defense">Missiles &amp; defense</a>
        <a href="#guide-maps">Community maps</a
        ><a href="#guide-controls">Controls</a>
      </nav>
      <section id="guide-start">
        <span class="guide-eyebrow">01 / YOUR FIRST CAMPAIGN</span>
        <h2>Choose a place to grow</h2>
        <p>
          Choose <strong>Play solo</strong> for an AI campaign, or
          <strong>Create lobby</strong> for multiplayer. Pick a map, choose your
          nation settings and bots, and select a starting position with room to
          expand.
        </p>
        <p>
          Click nearby land to expand. Select another country to see attack and
          diplomacy options. Watch your troop reserve and attack ratio:
          committing too much can leave your own borders exposed. Build on
          territory you control, upgrade valuable buildings, and protect your
          trade routes.
        </p>
        <p>
          Lobby hosts can disable individual units and buildings.
          <strong>Peace time</strong> can be Off, 3, 5 or 10 minutes. During
          that opening period, real players cannot attack one another; attacks
          involving bots and AI nations remain allowed.
        </p>
        <button
          class="guide-action"
          @click=${() =>
            document.dispatchEvent(new CustomEvent("start-tutorial"))}
        >
          Start guided solo game
        </button>
      </section>
      <section id="guide-economy">
        <span class="guide-eyebrow">02 / ECONOMY</span>
        <h2>Invest before you expand</h2>
        <p>
          Cities support your growth. Ports open sea trade. Factories send
          trains through connected rail networks. Add economy buildings to
          generate gold and improve trade income.
          <strong>K means thousand; M means million.</strong>
        </p>
        <div class="guide-table-scroll">
          <table>
            <caption>
              Economy building costs and benefits
            </caption>
            <thead>
              <tr>
                <th>Building</th>
                <th>Cost by level</th>
                <th>Benefit</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Oil Factory</th>
                <td>1.2M / 1.3M / 1.5M</td>
                <td>50K / 75K / 90K gold every 10 seconds</td>
                <td>5 buildings, level 3</td>
              </tr>
              <tr>
                <th>Copper Mine</th>
                <td>650K / 1M</td>
                <td>25K / 40K gold every 10 seconds</td>
                <td>2 buildings, level 2</td>
              </tr>
              <tr>
                <th>Logistics Center</th>
                <td>1M; 35-second build</td>
                <td>+15% train income</td>
                <td>1 building, level 1</td>
              </tr>
              <tr>
                <th>Customs Office</th>
                <td>1M; 25-second build</td>
                <td>
                  +10% income on trains trading with the neighboring player
                </td>
                <td>1 per neighboring player, level 1</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Customs Offices must sit on a border with another player. Once a
          building limit is reached, you can still select and upgrade existing
          buildings until they reach their maximum level. Captured Oil Factories
          and Copper Mines beyond your limit are removed. Customs Offices and
          Strait Control Stations are destroyed when captured; rebuild your own
          to collect bonuses or tolls.
        </p>
      </section>
      <section id="guide-trade">
        <span class="guide-eyebrow">03 / CONNECTIONS</span>
        <h2>Own the routes that matter</h2>
        <p>
          Nearby buildings connect by rail where a valid route exists. Factories
          supply the trains; connected destinations earn income. For a water
          crossing,
          <strong
            >both rail-capable buildings must reach level
            ${WATER_TUNNEL_MIN_LEVEL}</strong
          >
          and be <strong>at most ${WATER_TUNNEL_MAX_RANGE} tiles apart</strong>.
          A dashed cyan tunnel then joins the network automatically. Destroying
          either endpoint breaks the tunnel.
        </p>
        <h3>Strait Control Stations</h3>
        <p>
          Build at a valid narrow waterway where you control both banks.
          Placement highlights the crossing. Construction takes 90 seconds; the
          first station costs 3.5M and the second 5M. You can own two stations,
          each with one level.
        </p>
        <p>
          Enable a toll from <strong>1% to 10%</strong> and optionally exempt
          allies. Other players can accept or reject your terms. Rejecting
          blocks their trade ships from that crossing; ships seek another route
          or wait if none exists. Destroying the station or capturing its banks
          cancels its toll.
        </p>
        <p>
          A toll is charged separately to the sender. For a 100K delivery with a
          10% toll, the sender pays an additional 10K to the station owner and
          the destination still receives the full 100K.
        </p>
      </section>
      <section id="guide-defense">
        <span class="guide-eyebrow">04 / ATTACK &amp; DEFENSE</span>
        <h2>Plan around the defenses</h2>
        <p>
          All missiles launch from the <strong>Bunker Missile Site</strong>. Its
          initial build takes 50 seconds and costs 1M. Upgrading costs 1.3M for
          level 2 and 1.5M for subsequent levels; each upgrade takes 2 seconds.
          Watch the defense coverage shown when aiming a missile.
        </p>
        <dl>
          <dt>Stealth Missile / 1.5M</dt>
          <dd>
            Hidden until it reaches the target country's border. It destroys
            buildings in half the area of an atom bomb, without radioactive
            land. SAM Launchers can miss it.
          </dd>
          <dt>Hypersonic Missile / 950K</dt>
          <dd>
            Very fast. Normal SAM Launchers in countries along its route cannot
            intercept it; the target country's SAM Launchers can. It destroys
            buildings without radioactive land.
          </dd>
          <dt>EMP Missile / 750K</dt>
          <dd>
            A hidden, non-damaging strike. On arrival it disables hostile CIWS
            in its effect area for 5 seconds, provided no enemy SAM Launcher
            detected it earlier. Each arrival also suppresses one interception
            slot in every hostile SAM within 70 tiles for 5 seconds, even if the
            missile was detected. Multiple hits stack and each slot recovers on
            its own timer. A level-20 SAM hit twice has capacity 18 until the
            effects expire; its purchased level stays 20.
          </dd>
          <dt>CIWS Defense</dt>
          <dd>
            Intercepts supported missiles without misses while active. Costs 2M
            at level 1, 3M at level 2 and 3.5M per later upgrade, up to level 5.
            EMP can temporarily disable it. Hydrogen bombs can penetrate and
            destroy it; normal SAM Launchers can intercept hydrogen bombs.
          </dd>
        </dl>
      </section>
      <section id="guide-maps">
        <span class="guide-eyebrow">05 / YOUR WORLD</span>
        <h2>Play a community map. Create your own.</h2>
        <p>
          Find approved community maps in the map picker for solo and
          multiplayer. Explore <strong>Iran: Caspian to Hormuz</strong>,
          <strong>Middle East: Crossroads</strong> and
          <strong>Shattered Crown</strong>, built by Artin Zomorodian.
        </p>
        <p>
          Use the header's <strong>Log in</strong> icon to sign in or create an
          account. The map creation icon appears after sign-in. Start with blank
          water, paint land and waterways, choose your map size, and place or
          randomize nation spawns. Use fullscreen for more space. You can also
          open <strong>Import a map image</strong>, upload a PNG, JPG or WebP,
          and preview an automatically generated pixel map. Adjust water
          detection, use the generated terrain, then add spawns and keep
          painting. Fine and Ultra terrain detail preserve more of the image's
          coastline. Publish sends your map to admin review; it becomes playable
          after approval. Your profile tracks submissions and account details.
        </p>
      </section>
      <section id="guide-controls">
        <span class="guide-eyebrow">06 / CONTROLS</span>
        <h2>Keep the useful keys close</h2>
        <p>
          Drag to pan and scroll to zoom. Use
          <kbd>${label(bindings.buildMenuModifier)}</kbd> + click for the build
          menu, and <kbd>${label(bindings.shiftKey)}</kbd> + click for a quick
          attack. Key bindings can be changed in Settings.
        </p>
        <p>
          Default build shortcuts use Shift and a number:
          <strong>S1 means Shift + 1</strong>. The building bar shows your
          configured shortcut.
        </p>
        <dl class="guide-shortcuts">
          ${shortcuts.map(
            ([key, name]) =>
              html`<div>
                <dt><kbd>${key}</kbd></dt>
                <dd>${name}</dd>
              </div>`,
          )}
        </dl>
        <p>
          In the map editor: B for brush, F for fill, L for line, R for
          rectangle, E for ellipse. Hold Space and drag to pan; Ctrl + scroll
          zooms. Ctrl + Z undoes, and Ctrl + Shift + Z redoes.
        </p>
        <button
          class="guide-action"
          @click=${() => window.showPage?.("page-troubleshooting")}
        >
          Connection help &amp; troubleshooting
        </button>
      </section>
    </article>`;
  }
}
