#!/usr/bin/env node

const protobuf = require("protobufjs");
const fs = require("fs");
const path = require("path");
const assimpjs = require ('assimpjs')();

const config = JSON.parse(fs.readFileSync("model.json").toString());

assimpjs.then ((ajs) => {
    let fileList = new ajs.FileList ();

    console.log(config);

    for (const key in config.inputs) {
        fileList.AddFile (
            key,
            fs.readFileSync (config.inputs[key])
        );
    }
    
    let result = ajs.ConvertFileList (fileList, 'assjson');

    if (!result.IsSuccess () || result.FileCount () == 0) {
        console.log (result.GetErrorCode ());
        return;
    }

    let resultFile = result.GetFile (0);
    let json_content = new TextDecoder ().decode (resultFile.GetContent ());

    protobuf.load(path.join(__dirname, "model.proto"), function (err, root) {
        if (err) {
            throw err;
        }
    
        let Model = root.lookupType("model.Model");
    
        let data = {};
    
        let origin = JSON.parse(json_content);
        data.rootnode = origin.rootnode;
        data.flags = origin.flags;
        for (let it of origin.meshes) {
            if (it.faces) {
                let faces = [];
                for (const f of it.faces) {
                    faces.push({
                        data: f
                    });
                }
                it.faces = faces;
            }
            if (it.bones) {
                for (let b of it.bones) {
                    let weights = [];
                    for (const w of b.weights) {
                        weights.push({
                            data: w
                        });
                    }
                    b.weights = b.weights;
                }
            }
            if(it.texturecoords){
                let texturecoords = []
                for (let t of it.texturecoords) {
                    texturecoords.push({
                        data: t
                    })
                }
                it.texturecoords = texturecoords;
            }
        }
        data.meshes = origin.meshes;
    
        if (origin.materials) {
            data.materials = [];
            for (let material of origin.materials) {
    
                let it = {
                    properties: []
                };
                if (material.properties) {
                    for (let property of material.properties) {
                        if (typeof property.value === 'string'){
                            property.svalue = property.value;
                        }
                        else if (typeof property.value === 'number') {
                            property.fvalue = property.value;
                        }
                        else if (property.value instanceof Array && typeof property.value[0] === 'number') {
                            property.farray = property.value;
                        }
                        delete property.value;
                        it.properties.push(property);
                    }
                }
                data.materials.push(it);
            }
        }
    
    
    
        function change_it(channel, name) {
            let its = [];
            for (const it of channel[name]) {
                its.push({
                    val1: it[0],
                    val2: it[1]
                });
            }
            channel[name] = its;
        }
    
        if (origin.animations) {
            for (let animation of origin.animations) {
                if (animation.channels) {
                    for (let channel of animation.channels) {
                        change_it(channel, "positionkeys");
                        change_it(channel, "rotationkeys");
                        change_it(channel, "scalingkeys");
                    }
                }
            }
            data.animations = origin.animations;
        }
    
        let errMsg = Model.verify(data);
        if (errMsg) {
            throw new Error(errMsg);
        }
    
        let message = Model.create(data);
        let buffer = Model.encode(message).finish();
        fs.writeFileSync(config.outfile, buffer);
    });

});