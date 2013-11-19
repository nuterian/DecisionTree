$(function(){
    $trainDataContainer = $("#trainDataContainer");
    $trainInput = $("#trainInput");
    $trainNameInput = $("#trainNameInput");
    $trainTable = $("#trainingDataTable > tbody");
    $treeEntropyTable = $("#treeEntropyTable");

    _curTable = [];
    _curTableInfo = [];
    _curTrees = {};
    
    function listSets(){
        $trainTable.html('');
        var sets = JSON.parse(localStorage['DTClass.sets']);
        for(var i=0; i<sets.length; i++){
            $trainTable.append('<tr data="'+i+'"><td class="title">'+sets[i].name+'</td><td>'+sets[i].modified+'<td class="actions"></td></tr>');
        }        
    }

    function loadTrainSet(id)
    {
        if (id == $trainDataContainer.attr("data")) return; 
        $("#treeVisContainer").html('');
        if($trainDataContainer.is(':hidden')) $trainDataContainer.show();
        $("#treeEntropyContainer").hide();
        $("#testInputContainer").hide();

        var sets = JSON.parse(localStorage['DTClass.sets']);
        $trainInput.val(sets[id].raw_train);
        $trainDataContainer.attr("data", id);
        $trainNameInput.val(sets[id].name);
    }

    function getLabel(node, test)
    {
        if(node.isLeaf){return {label:node.attribute, chance: node.chance};}

        for(var i=0; i<node.children.length; i++){
            if(test[node.attribute] == node.children[i].label){
                return getLabel(node.children[i], test);
                break;
            }
        }
    }

    function predictLabel(arr)
    {
        var test = {}, i=0, predAttr = "", f=0;
        for(attr in _curTable[0]){
            test[attr] = arr[i++];
            if(test[attr] == ""){
                if (f == 1) return null;
                predAttr = attr;
                f=1;
            }
        }
        console.log(arr);
        if (predAttr == "") return null;

        console.log(JSON.stringify(_curTrees[predAttr].root));
        return { attrib: predAttr, label: getLabel(_curTrees[predAttr].root, test) };
    }

    function showTreeEfficiencies()
    {
        $("#treeEntropyContainer").show();
        $treeEntropyTable.html('');
        $treeEntropyTable.append("<thead><tr></tr></thead>");
        $treeEntropyTable.append("<tbody><tr></tr></tbody>");
        
        var curClass = false;
        var minEfficiency = 999;
        var minEfficiencyClass, minEfficiencyAttrib;

        for(attrib in _curTrees){

            var tmpClass = $treeEntropyTable.find("thead tr");
            tmpClass = $("<th>"+attrib+"</th>").appendTo(tmpClass); 

            $treeEntropyTable.find("tbody tr").append("<td>"+(_curTrees[attrib].efficiency).toFixed(2)+"</td>");
            
            if(_curTrees[attrib].efficiency <= minEfficiency){
                minEfficiency = _curTrees[attrib].efficiency;
                minEfficiencyAttrib = attrib;
                minEfficiencyClass = tmpClass;
            }
        }

        curClass = minEfficiencyClass;
        $(curClass).addClass("active");
        showTree(minEfficiencyAttrib);

        
        $treeEntropyTable.on("click", "th", function(e){
            if(!curClass) curClass = e.currentTarget;

            if(curClass != e.currentTarget){
                $(curClass).removeClass('active');
                curClass = e.currentTarget;
            }
            showTree($(curClass).text());
            $(e.currentTarget).addClass('active');

        });

    }

    function getTreeData(root)
    {
        var children = []
        for(var i=0; i<root.children.length; i++){
            children.push(getTreeData(root.children[i]));
        }

        var ret = { "attribute" : root.attribute, "label": root.label , "chance": root.chance};
        if(children.length > 0 ) ret["children"] = children;

        return ret;
    }

    var _curTreeContainer = false;
    function showTree(attr)
    {
        if(_curTreeContainer) _curTreeContainer.select("svg").attr("style","display:none");

        var container = d3.select("#treeVisContainer div[attrib="+attr+"]");
        if(!container[0][0]){
            container = d3.select("#treeVisContainer").append("div").attr("attrib",attr);

            var treeData = getTreeData(_curTrees[attr].root);
            var g = new dagreD3.Digraph();

            var i =0;
            function drawTree(parent, node)
            {
              node.id = i++;
              g.addNode(node.id, {label: node.attribute+"|"+node.chance.toFixed(2)});

              if(parent)
                g.addEdge(null, parent.id,  node.id, { label: node.label});

              if(node.children){
                for(var j=0; j<node.children.length; j++){
                  drawTree(node, node.children[j]);
                }
              }
            }

            drawTree(false, treeData);

            var renderer = new dagreD3.Renderer();
            var svg = container.append("svg:svg")
                .append("g")
                .attr("transform", "translate(" + 15 + "," + 15 + ")");

            var layout = dagreD3.layout()
                    .rankSep(60)

            renderer.layout(layout).run(g, svg);

            var treeWidth = svg[0][0].getBBox().width;
            container.select("svg").attr("height", svg[0][0].getBBox().height+30);
            container.attr("style","width:"+(svg[0][0].getBBox().width + 30)+"px; max-width:1000px; margin:0 auto;");

            if(treeWidth > 1000){
                container.call(d3.behavior.zoom().on("zoom", function() {
                var ev = d3.event;
                svg
                  .attr("transform", "translate(" + ev.translate + ") scale(" + ev.scale + ")");
                }));
            }
        }
        _curTreeContainer = container;
        _curTreeContainer.select("svg").attr("style","display:block");

    }


    $("#createButton").click(function(){
        $trainDataContainer.show();
        $trainDataContainer.attr("data", "");
        $trainInput.val('');
        $("#treeEntropyContainer").hide();
        $("#testInputContainer").hide();
    });

    $("#saveButton").click(function(){
        var d = new Date();
        var set = {
            name: $trainNameInput.val(),
            raw_train: $trainInput.val(),
            modified: d.toLocaleDateString() + " " + d.toLocaleTimeString()
        };
        var sets = JSON.parse(localStorage['DTClass.sets']);
        var id = $trainDataContainer.attr("data");
        if(id == ""){
            $trainDataContainer.attr("data", sets.length);
            sets.push(set);
        }
        else
            sets[id] = set;

        localStorage['DTClass.sets'] = JSON.stringify(sets);

        listSets();
    });

    $("#parseButton").click(function(){

        var arr = CSVToArray($trainInput.val(), $("#parseDelInput").val());
        _curTable = genTable(arr);
        _curTableInfo = genTableInfo(_curTable);

        console.log(_curTableInfo);
        _curTrees = {};
        for(attrib in _curTable[0]){
            var root = new Node();
            var def_label = frequentVal(_curTable, attrib)
            console.log("GENERATING TREE: "+attrib);
            var tree = gTree(root, _curTable, _curTableInfo, attrib, def_label);
            console.log("TREE: "+attrib+" | "+tree.entropy+" | "+tree.leaves);
            _curTrees[attrib] = {root: root, efficiency: tree.entropy/(Math.log(tree.leaves)/Math.log(2))};
            //console.log(JSON.stringify(root));
        }
        showTreeEfficiencies();
        $("#testInputContainer").show();
        //console.log(_curTrees);
    });



    $("#testButton").click(function(){
        if($("#testInput").val() == "") return;
        var arr = CSVToArray($("#testInput").val(), ",");
        arr = arr[0];
        var label = predictLabel(arr);

        if(label == null) return;
        $("#testResult").html("<strong>"+label.attrib+":</strong> "+label.label.label+"<span class='light'> with "+(label.label.chance*100).toFixed(2)+"% chance</span>");
    });

    $trainTable.on("click", "tr", function(e){
        console.log(e.currentTarget);
        loadTrainSet($(e.currentTarget).attr("data"));
    });

    if (!("DTClass.sets" in localStorage) || localStorage['DTClass.sets'] == "[]"){
        localStorage["DTClass.sets"] = JSON.stringify([]);
        $trainTable.html('<td colspan="3" style="text-align:center; padding:30px 0">No Training sets found. Click the button above to create one.</td>');
    }
    else{
        listSets();
    }

});