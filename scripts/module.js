function priority(path) {
    //higher is more important
    if(path === 'pdftofoundry-image-mapping.json') {
        return 0;
    }
    if(path.startsWith('modules/pf2e-tokens-bestiaries/')) {
        return 2;
    }
    return 1;
}

Hooks.once('ready', async function() {

    if(!game.user.isGM) return;

    let modules = [];

    for(let m of game.modules.toJSON()) {
        if((typeof m.flags) !== 'object') return;
        for(let flag of Object.values(m?.flags)) {
            if((typeof flag) !== 'object') continue;
            if(flag['pf2e-art']) {
                let path = flag['pf2e-art'];
                modules.push({
                    path: path,
                    priority: priority(path),
                    file: await $.getJSON(path)
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
    let old = await $.get('modules/pf2e-all-tokens/storage/pf2e-art.json', null, null, 'text');
    if(resultJSON !== old) {
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
    }
});
