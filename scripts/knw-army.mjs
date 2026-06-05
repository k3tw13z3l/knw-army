// Stub for dnd5e properties that don't exist on non-dnd5e actor types.
// dnd5e's ready hook calls actor.sourcedItems._redirectKeys() on every actor;
// we stamp this stub onto warfare instances in prepareData so it never throws.
const WARFARE_STUB = Object.freeze({
  _redirectKeys() {},
  get() { return null; },
  has() { return false; },
  set() {},
  forEach() {},
});

class WarfareSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

  constructor(options = {}) {
    super(options);
    /** @type {Set<string>} Tracks which trait IDs are expanded in this sheet instance */
    this._expandedTraits = new Set();
  }

  static DEFAULT_OPTIONS = {
    classes: ["dnd5e", "sheet", "actor", "warfare"],
    position: { width: 748, height: 641 },
    form: { handler: WarfareSheet.#onSubmit, submitOnChange: true },
    dragDrop: [{ dropSelector: "form" }],
    actions: {
      rollStat: WarfareSheet.#rollStat,
      toggleConfig: WarfareSheet.#toggleConfig,
      toggleTrait: WarfareSheet.#toggleExpandState,
      deleteTrait: WarfareSheet.#deleteItem,
    }
  };

  static PARTS = {
    form: {
      template: "modules/knw-army/templates/warfare-sheet.hbs"
    }
  };

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    Object.assign(context, {
      actor: this.actor,
      system,
      coreStats: {
        atk: {
          label: game.i18n.localize("KNW.Warfare.Statistics.atk.abbr"),
          value: system.atk.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        def: {
          label: game.i18n.localize("KNW.Warfare.Statistics.def.abbr"),
          value: system.def
        },
        pow: {
          label: game.i18n.localize("KNW.Warfare.Statistics.pow.abbr"),
          value: system.pow.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        tou: {
          label: game.i18n.localize("KNW.Warfare.Statistics.tou.abbr"),
          value: system.tou
        },
        mor: {
          label: game.i18n.localize("KNW.Warfare.Statistics.mor.abbr"),
          value: system.mor.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        com: {
          label: game.i18n.localize("KNW.Warfare.Statistics.com.abbr"),
          value: system.com.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        }
      },
      choices: CONFIG.KNW.CHOICES,
      lvTier: this._tier,
      typeImage: this.typeImage
    });

    const aTrait = CONFIG.KNW.CHOICES.ANCESTRY[system.ancestry]?.trait ?? [];
    const compendiumTraits = game.packs.get('knw-army.traits').index.filter(item => aTrait.includes(item.name));
    const itemTraits = this.actor.items.filter(item => item.type === 'feat');

    const foundTraits = await Promise.all(compendiumTraits.map(ct => fromUuid(ct.uuid)));

    const [compendiumEnriched, itemEnriched] = await Promise.all([
      Promise.all(foundTraits.map(ft =>
        foundry.applications.ux.TextEditor.implementation.enrichHTML(ft.system?.description?.value ?? "", { async: true, links: true, rolls: true })
      )),
      Promise.all(itemTraits.map(it =>
        foundry.applications.ux.TextEditor.implementation.enrichHTML(it.system?.description?.value ?? "", { async: true, links: true, rolls: true })
      ))
    ]);

    context.selectedLabels = {
      experience: game.i18n.localize(CONFIG.KNW.CHOICES.EXPERIENCE[system.experience] ?? system.experience),
      gear: game.i18n.localize(CONFIG.KNW.CHOICES.GEAR[system.gear] ?? system.gear),
      ancestry: CONFIG.KNW.CHOICES.ANCESTRY[system.ancestry]?.label ?? system.ancestry,
      type: game.i18n.localize(CONFIG.KNW.CHOICES.TYPE[system.type]?.label ?? system.type),
      tier: CONFIG.KNW.CHOICES.TIER[system.tier] ?? system.tier
    };

    context.traits = [
      ...foundTraits.map((ft, i) => ({
        id: ft.id,
        name: ft.name,
        expanded: this._expandedTraits.has(ft.id),
        item: false,
        description: { enriched: compendiumEnriched[i] }
      })),
      ...itemTraits.map((it, i) => ({
        id: it.id,
        name: it.name,
        expanded: this._expandedTraits.has(it.id),
        item: true,
        description: { enriched: itemEnriched[i] }
      }))
    ];

    this._autoUpdateDiminished();
    return context;
  }

  get typeImage() {
    const system = this.actor.system;
    if ((system.type === "infantry") && (system.experience === "levy"))
      return "modules/knw-army/assets/icons/levy.png";
    else return CONFIG.KNW.CHOICES.TYPE[system.type].img;
  }

  /**
   * Returns true when HP is at or below half maximum. Pure — no side effects.
   * The template reads system.diminished directly; this getter is used by
   * _autoUpdateDiminished() to decide whether a write is needed.
   * @returns {boolean}
   */
  get dimCheck() {
    const { hp } = this.actor.system.attributes;
    return hp.value <= hp.max / 2;
  }

  /**
   * Writes system.diminished only when its stored value differs from what it
   * should be. Safe to call from _prepareContext() because the guard prevents the
   * write → re-render → write cycle that a naive update-always approach causes.
   */
  _autoUpdateDiminished() {
    const system = this.actor.system;
    const shouldBeDiminished = this.dimCheck;
    const isDiminishable = CONFIG.KNW.CHOICES.ANCESTRY[system.ancestry]?.diminishable ?? false;

    if (shouldBeDiminished && !system.diminished && isDiminishable) {
      ui.notifications.warn("Succeed on a morale check DC13 or gain 1 Dam");
      this.actor.update({"system.diminished": true});
    } else if (!shouldBeDiminished && system.diminished) {
      this.actor.update({"system.diminished": false});
    }
  }

  get _tier() {
    return CONFIG.KNW.CHOICES.TIER[this.actor.system.tier];
  }

  /** @override */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;

    const dropActor = await fromUuid(data.uuid);
    if (dropActor.pack) {
      ui.notifications.warn("KNW.Warfare.Commander.Warning.Pack", { localize: true });
      return false;
    } else if (!foundry.utils.hasProperty(dropActor, "system.attributes.prof")) {
      ui.notifications.warn("KNW.Warfare.Commander.Warning.NoProf", { localize: true });
      return false;
    }
    return this.actor.update({"system.commander": dropActor.id});
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._commanderContextMenu ??= new foundry.applications.ux.ContextMenu(this.element, ".armyUnit-commander", this.commanderMenu, { jQuery: false });
    for (const span of this.element.querySelectorAll("span.armyUnit-select[data-field]")) {
      span.addEventListener("contextmenu", (ev) => this._onFieldContextMenu(ev));
    }
  }

  static async #rollStat(event, target) {
    await this.actor.system.rollStat(target.dataset.target, event);
  }

  static async #toggleConfig(event, target) {
    await this.actor.update({"system.config": !this.actor.system.config});
  }

  static async #toggleExpandState(event, target) {
    const itemId = target.closest(".onetraitbox").dataset.itemId;
    if (this._expandedTraits.has(itemId)) this._expandedTraits.delete(itemId);
    else this._expandedTraits.add(itemId);
    this.render({ force: true });
  }

  static async #deleteItem(event, target) {
    event.stopPropagation();
    const itemId = target.closest(".onetraitbox").dataset.itemId;
    await this.actor.deleteEmbeddedDocuments('Item', [itemId]);
  }

  get commanderMenu() {
    return [
      {
        name: game.i18n.localize("KNW.Warfare.Commander.View"),
        icon: "<i class='fas fa-eye'></i>",
        condition: () => !!this.actor.system.commander,
        callback: () => this.actor.system.commander?.sheet.render({ force: true })
      },
      {
        name: game.i18n.localize("KNW.Warfare.Commander.Clear"),
        icon: "<i class='fas fa-trash'></i>",
        condition: () => this.isEditable && !!this.actor.system.commander,
        callback: this.clearCommander.bind(this)
      }
    ];
  }

  _onFieldContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    document.querySelector("nav.knw-choice-menu")?.remove();

    const field = event.currentTarget.dataset.field;
    const entries = this._getChoiceEntries(field);
    if (!entries?.length) return;

    const nav = document.createElement("nav");
    nav.classList.add("context-menu", "knw-choice-menu");
    nav.style.cssText = "position:fixed; z-index:9999;";

    const ol = document.createElement("ol");
    for (const { key, label } of entries) {
      const li = document.createElement("li");
      li.classList.add("context-item");
      li.innerHTML = `<span>${label}</span>`;
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        nav.remove();
        this.actor.update({ [`system.${field}`]: isNaN(key) ? key : Number(key) });
      });
      ol.appendChild(li);
    }
    nav.appendChild(ol);
    document.body.appendChild(nav);

    const { clientX, clientY } = event;
    const top = (clientY + nav.offsetHeight > window.innerHeight) ? clientY - nav.offsetHeight : clientY;
    const left = (clientX + nav.offsetWidth > window.innerWidth) ? clientX - nav.offsetWidth : clientX;
    nav.style.top = `${top}px`;
    nav.style.left = `${left}px`;

    setTimeout(() => {
      document.addEventListener("click", (e) => { if (!nav.contains(e.target)) nav.remove(); }, { once: true });
    }, 0);
  }

  _getChoiceEntries(field) {
    const defs = {
      experience: [CONFIG.KNW.CHOICES.EXPERIENCE, v => game.i18n.localize(v)],
      gear:       [CONFIG.KNW.CHOICES.GEAR,       v => game.i18n.localize(v)],
      ancestry:   [CONFIG.KNW.CHOICES.ANCESTRY,   v => v.label],
      type:       [CONFIG.KNW.CHOICES.TYPE,        v => game.i18n.localize(v.label)],
      tier:       [CONFIG.KNW.CHOICES.TIER,        v => v],
    }[field];
    if (!defs) return null;
    const [choices, getLabel] = defs;
    return Object.entries(choices).map(([key, value]) => ({ key, label: getLabel(value) }));
  }

  async clearCommander() {
    const commander = this.actor.system.commander;
    ui.notifications.info(
      game.i18n.format("KNW.Warfare.Commander.Warning.Remove", {
        commanderName: commander.name,
        warfareUnit: this.actor.name
      })
    );
    await this.actor.update({"system.commander": null});
  }

}

const KNWCONFIG = {
  DND5E: {
    sourceBooks: {
      "K&W": "Kingdoms & Warfare"
    }
  },
  KNW: {
    CHOICES: {
      EXPERIENCE: {
        levy: "KNW.Warfare.Experience.levy",
        regular: "KNW.Warfare.Experience.regular",
        veteran: "KNW.Warfare.Experience.veteran",
        elite: "KNW.Warfare.Experience.elite",
        superElite: "KNW.Warfare.Experience.super-elite"
      },
      GEAR: {
        light: "KNW.Warfare.Gear.light",
        medium: "KNW.Warfare.Gear.medium",
        heavy: "KNW.Warfare.Gear.heavy",
        superHeavy: "KNW.Warfare.Gear.super-heavy"
      },
      TYPE: {
        aerial: {
          label: "KNW.Warfare.Type.aerial",
          img: "modules/knw-army/images/type/aerial.png"
        },
        artillery: {
          label: "KNW.Warfare.Type.artillery",
          img: "modules/knw-army/images/type/artillery.png"
        },
        artillerySiege: {
          label: "KNW.Warfare.Type.artillery-siege",
          img: "modules/knw-army/images/type/siege.png"
        },
        cavalry: {
          label: "KNW.Warfare.Type.cavalry",
          img: "modules/knw-army/images/type/cavalry.png"
        },
        infantry: {
          label: "KNW.Warfare.Type.infantry",
          img: "modules/knw-army/images/type/infantry.png"
        }
      },
      ANCESTRY: {
        human: {
          label: "Human",
          diminishable: true,
          trait: [ "Adaptable" ]
        },
        elf: {
          label: "Elf",
          diminishable: true,
          trait: [ "Eternal" ]
        },
        dwarf: {
          label: "Dwarf",
          diminishable: true,
          trait: ["Stalwart"]
        },
        undead: {
          label: "Undead",
          diminishable: false,
          trait: [ "Dead", "Harrowing" ]
        },
        fey: {
          label: "Fey",
          diminishable: true,
          trait: [ "Eternal" ]
        },
        centaur: {
          label: "Centaur",
          diminishable: true,
          trait: ["Quadruped", "Archers" ]
        },
        orc: {
          label: "Orc",
          diminishable: true,
          trait: ["Relentless"]
        },
        spriggan: {
          label: "Spriggan",
          diminishable: true,
          trait: ["Barbs"]
        },
        gnoll: {
          label: "Gnoll",
          diminishable: true,
          trait: ["Rush","Feast"]
        }
      },
      TIER: {
        1: "Ⅰ",
        2: "Ⅱ",
        3: "Ⅲ",
        4: "Ⅳ",
        5: "Ⅴ"
      }
    }
  }
};

/**
 *
 * @param {TokenConfig} app
 * @param {JQuery} html
 * @param {object} context
 */
function warfareTokenBar(app, html, context, options) {
  const barSelects = html.querySelectorAll("select[name=\"bar1.attribute\"], select[name=\"bar2.attribute\"]");
  for (const bar of barSelects) {
   let skipFirst = true;
    for (const el of bar.querySelectorAll("option")) {
      if (skipFirst) {
        skipFirst = false;
        continue;
      }
      el.remove();
    }
    for (const grp of bar.querySelectorAll("optgroup")) {
      switch (grp.label) {
        case game.i18n.localize("TOKEN.BarAttributes"):
          grp.innerHTML = `<option value="attributes.hp">${game.i18n.localize(
            "KNW.Warfare.Statistics.size.long"
          )}</option>`;
          break;
        case game.i18n.localize("TOKEN.BarValues"):
          grp.innerHTML = ["attacks", "def", "tou"]
            .map(
              (abbr) =>
                `<option value="${abbr}">${game.i18n.localize(
                  `KNW.Warfare.Statistics.${abbr}.long`
                )}</option>`
            )
            .join("")
            .concat(
              `<option value="tier">${game.i18n.localize(
                "KNW.Warfare.Tier"
              )}</option>`
            );
          break;
        case game.i18n.localize("DND5E.MovementSpeeds"):
          grp.innerHTML = `<option value="mov">${game.i18n.localize(
            "KNW.Warfare.Statistics.mov.long"
          )}</option>`;
          break;
        default:
          grp.remove();
      }
    }
  }

} 

const moduleID = "knw-army";
const typeWarfare = "knw-army.warfare";

Hooks.once("init", () => {
  foundry.utils.mergeObject(CONFIG, KNWCONFIG);

  // Bypass dnd5e's calculateDamage for warfare actors — the warfare HP system
  // doesn't have the dnd5e fields (temp, traits, etc.) that calculateDamage expects.
  const ActorClass = getDocumentClass("Actor");

  // Bypass dnd5e's _preUpdate for warfare actors. dnd5e's _preUpdate silently swallows
  // updates for fields it can't process (ability scores, HP, resources, etc.) when the
  // actor lacks the expected dnd5e system shape. Use Foundry's base implementation instead.
  const _origPreUpdate = ActorClass.prototype._preUpdate;
  const _basePreUpdate = Object.getPrototypeOf(ActorClass.prototype)._preUpdate;
  ActorClass.prototype._preUpdate = async function(changed, options, user) {
    if (this.type !== typeWarfare) return _origPreUpdate.call(this, changed, options, user);
    return _basePreUpdate?.call(this, changed, options, user);
  };

  const _origModifyTokenAttribute = ActorClass.prototype.modifyTokenAttribute;
  ActorClass.prototype.modifyTokenAttribute = async function(attribute, value, isDelta, isBar) {
    if (this.type !== typeWarfare) return _origModifyTokenAttribute.call(this, attribute, value, isDelta, isBar);
    const attr = foundry.utils.getProperty(this.system, attribute);
    if (!attr || typeof attr !== "object") return _origModifyTokenAttribute.call(this, attribute, value, isDelta, isBar);
    let newValue = isDelta ? (attr.value ?? 0) + value : value;
    newValue = Math.round(Math.min(Math.max(newValue, 0), attr.max ?? Infinity));
    return this.update({ [`system.${attribute}.value`]: newValue });
  };

  // Stamp WARFARE_STUB onto sourcedItems for every warfare actor so that
  // dnd5e's ready hook (which calls actor.sourcedItems._redirectKeys()) never throws.
  const _origPrepareData = Actor.prototype.prepareData;
  Actor.prototype.prepareData = function () {
    _origPrepareData.call(this);
    if (this.type === typeWarfare) {
      const desc = Object.getOwnPropertyDescriptor(this, "sourcedItems");
      if (!desc || desc.configurable) {
        Object.defineProperty(this, "sourcedItems", {
          value: WARFARE_STUB, configurable: true, writable: true, enumerable: false
        });
      }
    }
  };

  class WarfareData extends foundry.abstract.TypeDataModel {
    /** @override */
    static defineSchema() {
      const fields = foundry.data.fields;
      return {
        commander: new fields.ForeignDocumentField(getDocumentClass("Actor"), {
          textSearch: true, label: "KNW.Warfare.Commander.Label"
        }),
        battles: new fields.NumberField({
          initial: 0, nullable: false, integer: true, label: "survived"
        }),
        ancestry: new fields.StringField({
          choices: CONFIG.KNW.CHOICES.ANCESTRY,
          initial: "human", textSearch: true, label: "KNW.Warfare.Ancestry"
        }),
        experience: new fields.StringField({
          choices: CONFIG.KNW.CHOICES.EXPERIENCE,
          initial: "regular", textSearch: true, label: "KNW.Warfare.Experience.Label"
        }),
        gear: new fields.StringField({
          choices: CONFIG.KNW.CHOICES.GEAR,
          initial: "light", textSearch: true, label: "KNW.Warfare.Gear.Label"
        }),
        type: new fields.StringField({
          choices: CONFIG.KNW.CHOICES.TYPE,
          initial: "infantry", textSearch: true, label: "KNW.Warfare.Type.Label"
        }),
        atk: new fields.NumberField({
          required: true, initial: 0, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.atk.long"
        }),
        def: new fields.NumberField({
          required: true, initial: 10, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.def.long"
        }),
        pow: new fields.NumberField({
          required: true, initial: 0, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.pow.long"
        }),
        tou: new fields.NumberField({
          required: true, initial: 10, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.tou.long"
        }),
        mor: new fields.NumberField({
          required: true, initial: 0, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.mor.long"
        }),
        com: new fields.NumberField({
          required: true, initial: 0, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.com.long"
        }),
        attacks: new fields.NumberField({
          required: true, initial: 1, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.attacks.long"
        }),
        dmg: new fields.NumberField({
          required: true, initial: 1, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.dmg.long"
        }),
        mov: new fields.NumberField({
          required: true, initial: 1, nullable: false, integer: true,
          label: "KNW.Warfare.Statistics.move.long"
        }),
        tier: new fields.NumberField({
          required: true, initial: 1, integer: true,
          choices: CONFIG.KNW.CHOICES.TIER, label: "KNW.Warfare.Tier"
        }),
        attributes: new fields.SchemaField({
          movement: new fields.SchemaField({
            units: new fields.StringField({ initial: "ft" }),
            walk: new fields.NumberField({ required: true, initial: 4, integer: true }),
          }),
          hp: new fields.SchemaField({
            max: new fields.NumberField({ required: true, initial: 6, integer: true }),
            value: new fields.NumberField({ required: true, initial: 6, integer: true })
          }),
        }),
        config: new fields.BooleanField({
          required: true, initial: true, label: "enable edit"
        }),
        diminished: new fields.BooleanField({
          required: true, initial: false, label: "Hit hard"
        })
      };
    }

    get casualtyDie() {
      return this.attributes.hp.value;
    }

    get commanderName() {
      const commander = this.commander;
      return commander ? commander.name : game.i18n.localize("KNW.Warfare.Commander.None");
    }

    async rollStat(stat, event) {
      return CONFIG.Dice.D20Roll.build({
        rolls: [{ parts: ["@stat"], data: { stat: this[stat] }, options: {} }],
        event
      }, {
        options: {
          window: {
            title: game.i18n.format("KNW.Warfare.Statistics.Test", {
              stat: game.i18n.localize(`KNW.Warfare.Statistics.${stat}.long`),
              actorName: this.parent.name
            })
          }
        }
      }, {
        data: {
          speaker: { actor: this.parent },
          flavor: game.i18n.format("KNW.Warfare.Statistics.Test", {
            stat: game.i18n.localize(`KNW.Warfare.Statistics.${stat}.long`),
            actorName: this.commander?.name ?? ""
          })
        }
      });
    }
  }

  Object.assign(CONFIG.Actor.dataModels, {
    [typeWarfare]: WarfareData
  });

  foundry.documents.collections.Actors.registerSheet(moduleID, WarfareSheet, {
    types: [typeWarfare],
    makeDefault: true,
    label: "KNW.Sheets.Warfare"
  });

  CONFIG.statusEffects.push({
    id: "broken",
    name: "KNW.Warfare.Conditions.Broken",
    img: "systems/dnd5e/icons/svg/statuses/incapacitated.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disbanded",
    name: "KNW.Warfare.Conditions.Disbanded",
    img: "systems/dnd5e/icons/svg/statuses/dead.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disorganized",
    name: "KNW.Warfare.Conditions.Disorganized",
    img: "systems/dnd5e/icons/svg/statuses/stunned.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disoriented",
    name: "KNW.Warfare.Conditions.Disoriented",
    img: "modules/knw-army/assets/icons/disoriented.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "exposed",
    name: "KNW.Warfare.Conditions.Exposed",
    img: "modules/knw-army/assets/icons/exposed.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "hidden",
    name: "KNW.Warfare.Conditions.Hidden",
    img: "systems/dnd5e/icons/svg/statuses/hiding.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "misled",
    name: "KNW.Warfare.Conditions.Misled",
    img: "systems/dnd5e/icons/svg/statuses/surprised.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "weakened",
    name: "KNW.Warfare.Conditions.Weakened",
    img: "systems/dnd5e/icons/svg/statuses/exhaustion.svg",
    hud: {
      actorTypes: [typeWarfare]
    }
  });
});

Hooks.on("ready", () => {
  const actorTypes = Object.keys(game.model.Actor).filter(t => !t.startsWith("knw-army"));
  for (const status of CONFIG.statusEffects) {
    if ("hud" in status) continue;
    status.hud = {actorTypes};
  }
});

Hooks.on("renderTokenConfig5e", (app, html, context, options) => {
  switch (app.actor.type) {
    case typeWarfare:
      warfareTokenBar(app, html, context, options);
      break;
  }
});
