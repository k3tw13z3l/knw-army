/**
 * Data Definition for Warfare actors
 * @prop {string} commander
 * @prop {string} ancestry
 * @prop {string} experience
 * @prop {string} gear
 * @prop {string} type
 * @prop {number} atk
 * @prop {number} def
 * @prop {number} pow
 * @prop {number} tou
 * @prop {number} mor
 * @prop {number} com
 * @prop {number} attacks
 * @prop {number} dmg
 * @prop {number} mov
 * @prop {number} tier
 * @prop {object} size
 * @prop {number} size.value
 * @prop {number} size.max
 * @prop {string} traitList
 */
class WarfareData extends foundry.abstract.TypeDataModel {
  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    const data = {
      commander: new fields.ForeignDocumentField(getDocumentClass("Actor"), {
        textSearch: true, label: "KNW.Warfare.Commander.Label"
      }),
      ancestry: new fields.StringField({
        choices: CONFIG.KNW.CHOICES.ANCESTRY,
        initial: "human",
        textSearch: true, label: "KNW.Warfare.Ancestry"
      }),
      experience: new fields.StringField({
        choices: CONFIG.KNW.CHOICES.EXPERIENCE,
        initial: "regular",
        textSearch: true,
        label: "KNW.Warfare.Experience.Label"
      }),
      gear: new fields.StringField({
        choices: CONFIG.KNW.CHOICES.GEAR,
        initial: "light",
        textSearch: true,
        label: "KNW.Warfare.Gear.Label"
      }),
      type: new fields.StringField({
        choices: CONFIG.KNW.CHOICES.TYPE,
        initial: "infantry",
        textSearch: true,
        label: "KNW.Warfare.Type.Label"
      }),
      atk: new fields.NumberField({
        required: true,
        initial: 0,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.atk.long"
      }),
      def: new fields.NumberField({
        required: true,
        initial: 10,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.def.long"
      }),
      pow: new fields.NumberField({
        required: true,
        initial: 0,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.pow.long"
      }),
      tou: new fields.NumberField({
        required: true,
        initial: 10,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.tou.long"
      }),
      mor: new fields.NumberField({
        required: true,
        initial: 0,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.mor.long"
      }),
      com: new fields.NumberField({
        required: true,
        initial: 0,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.com.long"
      }),
      attacks: new fields.NumberField({
        required: true,
        initial: 1,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.attacks.long"
      }),
      dmg: new fields.NumberField({
        required: true,
        initial: 1,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.dmg.long"
      }),
      mov: new fields.NumberField({
        required: true,
        initial: 1,
        nullable: false,
        integer: true,
        label: "KNW.Warfare.Statistics.move.long"
      }),
      tier: new fields.NumberField({
        required: true,
        initial: 1,
        choices: CONFIG.KNW.CHOICES.TIER,
        integer: true,
        label: "KNW.Warfare.Tier"
      }),
      size: new fields.SchemaField({
        max: new fields.NumberField({
          required: true,
          initial: 6,
          integer: true
        }),
        value: new fields.NumberField({
          required: true,
          initial: 6,
          integer: true
        })
      }, {label: "KNW.Warfare.Statistics.size.long"}),
      config: new fields.BooleanField({
        required: true,
        initial: true,
        label: "enable edit"
      }),
      diminished: new fields.BooleanField({
        required: true,
        initial: false,
        label: "Hit hard"
      })
    };

    return data;
  }

  /**
   * @returns {number} Current units remaining for a battle
   */
  get casualtyDie() {
    return this.size.value;
  }

  get commanderName() {
    const commander = this.commander;
    if (commander) return commander.name;
    else return game.i18n.localize("KNW.Warfare.Commander.None");
  }

  /**
   * Rolls one of the Warfare unit's stats
   * @param {string} stat     Warfare stat to roll
   * @param {Event} [event]   Optional event
   */
  async rollStat(stat, event) {
    return CONFIG.Dice.D20Roll.build({
      rolls: [{
        parts: ["@stat"],
        data: {
          stat: this[stat]
        },
        options: {}
      }],
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
    },
    {
      data: {
        speaker: {actor: this.parent},
        flavor: game.i18n.format("KNW.Warfare.Statistics.Test", {
          stat: game.i18n.localize(`KNW.Warfare.Statistics.${stat}.long`),
          actorName: this.commander?.name ?? ""
        })
      }
    });
  }
}

class WarfareSheet extends ActorSheet {
  /** @override */
  get template() {
    return "modules/knw-army/templates/warfare-sheet.hbs";
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e", "sheet", "actor", "warfare"],
      width: 748,
      height: 641
    });
  }

  /** @override */
  async getData(options) {
    const context = {
      ...super.getData(options),
      actor: this.actor,
      system: this.actor.system,
      coreStats: {
        atk: {
          label: game.i18n.localize("KNW.Warfare.Statistics.atk.abbr"),
          value: this.actor.system.atk.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        def: {
          label: game.i18n.localize("KNW.Warfare.Statistics.def.abbr"),
          value: this.actor.system.def
        },
        pow: {
          label: game.i18n.localize("KNW.Warfare.Statistics.pow.abbr"),
          value: this.actor.system.pow.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        tou: {
          label: game.i18n.localize("KNW.Warfare.Statistics.tou.abbr"),
          value: this.actor.system.tou
        },
        mor: {
          label: game.i18n.localize("KNW.Warfare.Statistics.mor.abbr"),
          value: this.actor.system.mor.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        },
        com: {
          label: game.i18n.localize("KNW.Warfare.Statistics.com.abbr"),
          value: this.actor.system.com.signedString(),
          rollable: this.isEditable ? "rollable" : ""
        }
      },
      diminished: this.dimCheck,
      choices: CONFIG.KNW.CHOICES,
      lvTier: this._tier,
      typeImage: this.typeImage
    };

    //debugger;    

    const system = this.actor.system;
    if (system.traits === undefined) system.traits = [];
    const aTrait = CONFIG.KNW.CHOICES.ANCESTRY[system.ancestry].trait
    const compendiumTraits = game.packs.get('knw-army.traits').index.filter((item) => (aTrait.includes(item.name)));
    const itemTraits = this.actor.items.filter((item) => (item.type='feat'));

   // ancestral traits

    for (const cTrait of compendiumTraits){
      const foundTrait = await fromUuid(cTrait.uuid);
      const check = system.traits.find((trait)=> trait.id === foundTrait._id);
      if (!check) {
        system.traits.push({
          id: foundTrait._id,
          name: foundTrait.name,
          expanded: false,
          item: false,
          description: {
            enriched: await TextEditor.enrichHTML(foundTrait.system?.description?.value,{
              async: true,
              links: true,
              rolls: true
            })
          }
        })
      }
    };
    for (const iTrait of itemTraits) {
      const check = system.traits.find((trait)=> trait.id === iTrait._id);
      if (!check) {
        system.traits.push({
          id: iTrait._id,
          name: iTrait.name,
          expanded: false,
          item: true,
          description: {
            enriched: await TextEditor.enrichHTML(iTrait.system?.description?.value,{
              async: true,
              links: true,
              rolls: true
            })
          }
        })
      }
    };
    return context;
  }

  /**
   * @returns {string} The image path
   */
  get typeImage() {
    const system = this.actor.system;
    if ((system.type === "infantry") && (system.experience === "levy"))
      return "modules/knw-army/assets/icons/levy.png";
    else return CONFIG.KNW.CHOICES.TYPE[system.type].img;
  } // typeImage

  get dimCheck() {
     const system = this.actor.system;
     if ( (system.size.value <= ( system.size.max / 2 ))) { 
       if ( system.diminished || !CONFIG.KNW.CHOICES.ANCESTRY[system.ancestry].diminishable ) return;
       ui.notifications.warn("Succeed on a morale check DC13 or gain 1 Dam");
       return this.actor.update({"system.diminished" : true});
     } else return this.actor.update({"system.diminished": false});
  } // dimcheck

  get _tier() {
    const system = this.actor.system;
    return CONFIG.KNW.CHOICES.TIER[system.tier];
  } // tier

  /**
   * @returns {Promise<Actor | false>} This sheet's actor
   * @override
   */
  async _onDropActor(event, data) {
    // Returns false if user does not have owners permissions of the unit
    if (!super._onDropActor(event, data)) return false;

    const dropActor = await fromUuid(data.uuid);
    if (dropActor.pack) {
      ui.notifications.warn("KNW.Warfare.Commander.Warning.Pack", {
        localize: true
      });
      return false;
    } else if (
      !foundry.utils.hasProperty(dropActor, "system.attributes.prof")
    ) {
      ui.notifications.warn("KNW.Warfare.Commander.Warning.NoProf", {
        localize: true
      });
      return false;
    }
    return this.actor.update({"system.commander": dropActor.id});
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.on(
      "click",
      ".armyUnit-statname.rollable",
      this.#rollStat.bind(this)
    );
    html.on(
      "click",
      ".onetraitbox",
      this._toggleExpandState.bind(this)
    );
    html.on(
      "click",
      ".armyUnit-lock",
      this._toggleConfig.bind(this)
    );
    html.on(
      "click",
      ".armyUnit-delTrait",
      this._deleteItem.bind(this)
    );

    ContextMenu.create(this, html, ".armyUnit-commander", this.commanderMenu);
  }

  /**
   * Roll a Warfare skill
   * @param {PointerEvent} event
   */
  async #rollStat(event) {
    const stat = event.currentTarget.dataset.target;
    this.actor.system.rollStat(stat, event);
  }

  async _toggleConfig(event) {
      const state = this.actor.system.config;
      this.actor.update({"system.config": !state});
  }

  async _toggleExpandState(event) {
    const toggleId = $(event.currentTarget).closest(".onetraitbox").data("itemId");
    const fTrait = this.actor.system.traits.find((trait) => trait.id === toggleId);
    const state = fTrait.expanded;
    fTrait.expanded = !state;
    this.render();
  }

  async _deleteItem(event) {
    const itemId = $(event.currentTarget).closest(".onetraitbox").data("itemId");
    await this.actor.deleteEmbeddedDocuments('Item', [itemId]);
  } 

  get commanderMenu() {
    const commander = this.actor.system.commander;
    return [
      {
        name: game.i18n.localize("KNW.Warfare.Commander.View"),
        icon: "<i class='fas fa-eye'></i>",
        condition: commander,
        callback: () => commander.sheet.render(true)
      },
      {
        name: game.i18n.localize("KNW.Warfare.Commander.Clear"),
        icon: "<i class='fas fa-trash'></i>",
        condition: this.isEditable && commander,
        callback: this.clearCommander.bind(this)
      }
    ];
  }

  async clearCommander() {
    const commander = this.actor.system.commander;
    ui.notifications.info(
      game.i18n.format("KNW.Warfare.Commander.Warning.Remove", {
        commanderName: commander.name,
        warfareUnit: this.actor.name
      })
    );
    this.actor.update({"system.commander": ""});
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
          img: "modules/knw-army/Images/type/aerial.png"
        },
        artillery: {
          label: "KNW.Warfare.Type.artillery",
          img: "modules/knw-army/Images/type/artillery.png"
        },
        artillerySiege: {
          label: "KNW.Warfare.Type.artillery-siege",
          img: "modules/knw-army/Images/type/siege.png"
        },
        cavalry: {
          label: "KNW.Warfare.Type.cavalry",
          img: "modules/knw-army/Images/type/cavalry.png"
        },
        infantry: {
          label: "KNW.Warfare.Type.infantry",
          img: "modules/knw-army/Images/type/infantry.png"
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
function warfareTokenBar(app, html, context) {
  const barSelects = html.find(".bar-attribute");
  barSelects.find("option:gt(0)").remove();
  for (const grp of barSelects.find("optgroup")) {
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
    }
  }
}

const moduleID = "knw-army";
const typeWarfare = "knw-army.warfare";

Hooks.once("init", () => {
  foundry.utils.mergeObject(CONFIG, KNWCONFIG);

  Object.assign(CONFIG.Actor.dataModels, {
    [typeWarfare]: WarfareData
  });

  Actors.registerSheet(moduleID, WarfareSheet, {
    types: [typeWarfare],
    makeDefault: true,
    label: "KNW.Sheets.Warfare"
  });

  CONFIG.statusEffects.push({
    id: "broken",
    name: "KNW.Warfare.Conditions.Broken",
    img: "systems/dnd5e/icons/svg/statuses/incapacitated.svg",
    description: "A unit that breaks becomes broken. It has lost its last casualty and is removed from the battle. Broken units can be reformed, usually by rallying.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disbanded",
    name: "KNW.Warfare.Conditions.Disbanded",
    img: "systems/dnd5e/icons/svg/statuses/dead.svg",
    description: "A disbanded unit is removed from the game and cannot be reformed by normal means.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disorganized",
    name: "KNW.Warfare.Conditions.Disorganized",
    img: "systems/dnd5e/icons/svg/statuses/stunned.svg",
    description: "A disorganised unit does nothing on its next activation while it attempts to regain unit cohesion.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "disoriented",
    name: "KNW.Warfare.Conditions.Disoriented",
    img: "modules/knw-army/assets/icons/disoriented.svg",
    description: "A disoriented unit can either take an action or move, but not both. Unless otherwise stated, this unit condition lasts until the end of the unit's next activation.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "exposed",
    name: "KNW.Warfare.Conditions.Exposed",
    img: "modules/knw-army/assets/icons/exposed.svg",
    description: "A unit is exposed if there are no units between it and the leftmost or rightmost battlefield edge, or if there are no units in any rank to the rear of the unit. Units in the center and reserve of an army's ranks cannot be exposed as long as that army has its own units in both its rear rank and anywhere in its front.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "hidden",
    name: "KNW.Warfare.Conditions.Hidden",
    img: "systems/dnd5e/icons/svg/statuses/hiding.svg",
    description: "When a unit is hidden, other units have disadvantage on Attack tests against it.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "misled",
    name: "KNW.Warfare.Conditions.Misled",
    img: "systems/dnd5e/icons/svg/statuses/surprised.svg",
    description: "A unit that is misled cannot attack, and spends its next activation moving randomly into an available space. Cavalry and aerial units cannot be misled.",
    hud: {
      actorTypes: [typeWarfare]
    }
  }, {
    id: "weakened",
    name: "KNW.Warfare.Conditions.Weakened",
    img: "systems/dnd5e/icons/svg/statuses/exhaustion.svg",
    description: "A unit that is weakened has disadvantage on Attack tests and Power tests.",
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

Hooks.on("renderTokenConfig5e", (app, html, context) => {
  switch (app.actor.type) {
    case typeWarfare:
      warfareTokenBar(app, html);
      break;
  }
});
