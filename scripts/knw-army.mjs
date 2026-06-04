// Stub for dnd5e properties that don't exist on non-dnd5e actor types.
// dnd5e's ready hook calls actor.sourcedItems._redirectKeys() on every actor;
// we stamp this stub onto warfare instances in prepareData so it never throws.
const WARFARE_STUB = Object.freeze({
  _redirectKeys() {},
  get() { return null; },
  has() { return false; },
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
    form: { submitOnChange: true },
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
    const id = this.element.id;
    this._commanderContextMenu ??= new foundry.applications.ux.ContextMenu(this.element, ".armyUnit-commander", this.commanderMenu, { jQuery: false });
    this._experienceMenu ??= new foundry.applications.ux.ContextMenu(document.body, `#${id} [data-field='experience']`, this._choiceMenu("system.experience", CONFIG.KNW.CHOICES.EXPERIENCE, v => game.i18n.localize(v)), { jQuery: false });
    this._gearMenu ??= new foundry.applications.ux.ContextMenu(document.body, `#${id} [data-field='gear']`, this._choiceMenu("system.gear", CONFIG.KNW.CHOICES.GEAR, v => game.i18n.localize(v)), { jQuery: false });
    this._ancestryMenu ??= new foundry.applications.ux.ContextMenu(document.body, `#${id} [data-field='ancestry']`, this._choiceMenu("system.ancestry", CONFIG.KNW.CHOICES.ANCESTRY, v => v.label), { jQuery: false });
    this._typeMenu ??= new foundry.applications.ux.ContextMenu(document.body, `#${id} [data-field='type']`, this._choiceMenu("system.type", CONFIG.KNW.CHOICES.TYPE, v => game.i18n.localize(v.label)), { jQuery: false });
    this._tierMenu ??= new foundry.applications.ux.ContextMenu(document.body, `#${id} [data-field='tier']`, this._choiceMenu("system.tier", CONFIG.KNW.CHOICES.TIER, v => v), { jQuery: false });
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

  _choiceMenu(field, choices, getLabel) {
    return Object.entries(choices).map(([key, value]) => ({
      name: getLabel(value),
      icon: "",
      condition: () => true,
      callback: () => this.actor.update({ [field]: isNaN(key) ? key : Number(key) })
    }));
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
          grp.innerHTML = `<option value="size">${game.i18n.localize(
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
