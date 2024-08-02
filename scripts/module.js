function priority(path) {
    //higher is more important
    if(path === 'pdftofoundry-image-mapping.json') {
        return 0;
    }
    if(path.startsWith('modules/pf2e-tokens-bestiaries/')) {
        return 2;
    }
    if(path.startsWith('modules/pf2e-tokens-monster-core/')) {
        return 3;
    }
    return 1;
}

Hooks.once('ready', async function() {
    /*handles the new foundry native way of managing token art*/

    game.compendiumArt.parseArtMapping = async function (packageId, mapping, credit) {
        /*direct copy from foundries private function*/
        const settings = game.settings.get("core", this.SETTING)?.[packageId] ?? { portraits: true, tokens: true };
        for ( const [packName, actors] of Object.entries(mapping) ) {
            const pack = game.packs.get(packName);
            if ( !pack ) continue;
            for ( let [actorId, info] of Object.entries(actors) ) {
                const entry = pack.index.get(actorId);
                if ( !entry || !(settings.portraits || settings.tokens) ) continue;
                if ( settings.portraits ) entry.img = info.actor;
                else delete info.actor;
                if ( !settings.tokens ) delete info.token;
                if ( credit ) info.credit = credit;
                const uuid = pack.getUuid(actorId);
                info = foundry.utils.mergeObject(this.get(uuid) ?? {}, info, { inplace: false });
                this.set(uuid, info);
            }
        }
        /*copy end*/
    }

    let newWayUsingModules = [];
    for(let m of game.modules) {
        if(m.active) continue;

        let flags = m?.flags;
        if(flags.compendiumArtMappings && flags.compendiumArtMappings.pf2e) {
            try {
                let {credit, mapping} = flags.compendiumArtMappings.pf2e;
                const json = await foundry.utils.fetchJsonWithTimeout(mapping);
                await game.compendiumArt.parseArtMapping(m.id, json, credit);
                newWayUsingModules.push(m.id);
            } catch(e) {
                Hooks.onError("CompendiumArt#_registerArt", e, {
                    msg: `Failed to parse compendium art mapping for package '${m?.title}'`,
                    log: "error"
                });
            }
        }
    }




    /* this handles the old pf2e specific way of handling token art */
    if(!game.user.isGM) return;

    let modules = [];

    for(let m of game.modules) {
        //also go through active modules or this will need rebuilding whenever the world is switched
        //skip modules that we already handled above because some modules specify both and that leads to problems
        if(m.id === 'pf2e-all-tokens' || newWayUsingModules.includes(m.id)) continue;

        for(let flag of Object.values(m?.flags)) {
            if((typeof flag) !== 'object') continue;
            if(flag['pf2e-art']) {
                let path = flag['pf2e-art'];
                modules.push({
                    path: path,
                    priority: priority(path),
                    file: await $.getJSON(path).catch(e=>{console.log(e); return {};})
                });
            }
        }
    }

    modules.sort((a,b)=>a.priority-b.priority);

    let result = {};
    for(let m of modules) {
        for(let [comp, content] of Object.entries(m.file)) {
            if(!result[comp]){
                result[comp] = content;
            }
            else {
                for(let [id, value] of Object.entries(content)) {
                    result[comp][id] = value;
                }
            }
        }
    }


    let resultJSON = JSON.stringify(result, null, 2);
    try {
        let old = await $.get('modules/pf2e-all-tokens/storage/pf2e-art.json', null, null, 'text');
        if(resultJSON === old) {
            return; //nothing to do then
        }
    } catch(e) {}
    //if different or non-existent we need to store it and reload
    console.log("pf2e-all-tokens | Art content changed, rewriting");
    await FilePicker.uploadPersistent('pf2e-all-tokens', '', new File([resultJSON], 'pf2e-art.json', {type: "application/json"}));

    const reload = await Dialog.confirm({
        title: "New token art required reload",
        content: `<p><b>PF2e Use all module tokens</b> found new token art. Using it requires a reload. Reload now?</p>`
    });
    if ( reload ) {
        game.socket.emit("reload");
        foundry.utils.debouncedReload();
    }
});
