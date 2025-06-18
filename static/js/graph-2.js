const FILE = "MC1_graph.json";
const INFLUENCES_EDGES = new Set([
    "InStyleOf", "DirectlySamples", "CoverOf",
    "InterpolatesFrom", "LyricalReferenceTo"
]);

d3.json(`/data/${FILE}`).then(data => {
    // los nombres de las claves vienen exactamente así:
    const nodes = data.nodes;
    const links = data.links || [];

    /* Indexación útil */
    const byId = new Map(nodes.map(d => [d.id, d]));
    const oceanusIds = new Set(nodes.filter(d => d.genre === "Oceanus Folk")
                                    .map(d => d.id));
    const sailorShiftId = nodes.find(d => d.id === "Sailor Shift")?.id;

    /* ---------- 1. TIMELINE ---------- */
    const extInfluenced = [];
    links.forEach(l => {
        if (INFLUENCES_EDGES.has(l["Edge Type"])) {
            const sourceIsOceanus = oceanusIds.has(l.source);
            const targetIsOceanus = oceanusIds.has(l.target);
            if (sourceIsOceanus ^ targetIsOceanus) {
                const other = byId.get(sourceIsOceanus ? l.target : l.source);
                if (other?.release_date) {
                    extInfluenced.push(other)
                }
            }
        }
    });

    const yearCounts = Array.from(
        d3.rollup(extInfluenced, v=>v.length, d=>+d.release_date),
        ([year, count]) => ({year, count})
    ).sort((a,b)=>a.year-b.year);

    drawTimeline(yearCounts);

    /* ---------- 2. BARRAS (Géneros y artistas) ---------- */
    const genreCounts = d3.sort(
        Array.from(d3.rollup(extInfluenced, v=>v.length, d=>d.genre)),
        ([,a], [,b]) => d3.descending(a, b)
    ).slice(0, 12);

    const artistCounts = d3.sort(
        Array.from(d3.rollup(
            extInfluenced.filter(d => d["Node Type"] === "Song" && d.name),
            v=>v.length, d=>d.name)),
        ([,a], [,b]) => d3.descending(a, b)
    ).slice(0, 12);

    drawBars(genreCounts, artistCounts);

    /* ---------- 3. RED POST SAILOR-SHIFT ---------- */
    const oceanusAfterShift = nodes.filter(d => d.genre === "Oceanus Folk" && +d.release_date >= 2024).map(d => d.id);
    
    const netLinks = links.filter(l =>{
        if(!INFLUENCES_EDGES.has(l["Edge Type"])) return false;
        return oceanusAfterShift.includes(l.source) || oceanusAfterShift.includes(l.target);
    });

    const netNodesIds = new Set(netLinks.flatMap(l => [l.source, l.target]));
    if (sailorShiftId) {
        netNodesIds.add(sailorShiftId);
    }

    const netNodes = Array.from(netNodesIds).map(id => {
        const n = byId.get(id) || {name:`id:${id}`, genre:"Otro"};
        return { id, label: n.name, genre: n.genre};
    });

    drawNetwork(netNodes, netLinks, sailorShiftId);

    /* ---------- SELECTOR DE VISTA ---------- */
    function setVisible(view){
        d3.selectAll("svg.graph").style("display","none");    // oculta todo
        d3.select(`#${view}`).style("display","block");
        /* actualizar títulos (opcional) */
        d3.selectAll("h2").style("display","none");
        d3.select(`#title-${view}`).style("display",null);
    }
    /* Mostrar por defecto el primero */
    setVisible("timeline");

    d3.select("#viewSelector").on("change", function(){
        setVisible(this.value);
    });
});

/* ---------- DIBUJAR TIMELINE ---------- */
function drawTimeline(data){
    const svg = d3.select("#timeline"),
            width   = +svg.attr("width"),
            height  = +svg.attr("height"),
            m = {top: 20, right: 20, bottom: 30, left: 40},
            w = width - m.left - m.right,
            h = height - m.top - m.bottom;

    const x = d3.scaleLinear()
                .domain(d3.extent(data,d => d.year))
                .range([0,w]);

    const y = d3.scaleLinear()
                .domain([0, d3.max(data,d => d.count)]).nice()
                .range([h,0]);

    const area = d3.area()
                    .x(d=>x(d.year))
                    .y0(h).y1(d=>y(d.count))
                    .curve(d3.curveMonotoneX);

    const g = svg.append("g")
                .attr("transform",`translate(${m.left},${m.top})`);
    
    g.append("path")
        .datum(data)
        .attr("fill","#69b3a2")
        .attr("d",area);
    
    g.append("g")
        .attr("class","axis")
        .attr("transform",`translate(0,${h})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    g.append("g")
        .attr("class","axis")
        .call(d3.axisLeft(y));
}

/* ---------- DIBUJAR BARRAS ---------- */
function drawBars(genreCounts, artistCounts){
    const svg = d3.select("#bars"),
            width   = +svg.attr("width"),
            height  = +svg.attr("height"),
            m = {top: 20,right: 20,bottom: 30,left: 160},
            w = width - m.left - m.right,
            h = height - m.top - m.bottom;

    const all = genreCounts.map(([g,c])=>({label: g, count: c, type: "Género"}))
                .concat(artistCounts.map(([a,c])=>({label: a, count: c, type: "Artista"})));

    const y = d3.scaleBand().domain(all.map(d=>d.label))
                            .range([0,h])
                            .padding(0.1);

    const x = d3.scaleLinear().domain([0, d3.max(all,d=>d.count)])
                                .range([0, w]).nice();

    const color = d3.scaleOrdinal().domain(["Género", "Artista"])
                    .range(["#1f77b4","#ff7f0e"]);

    const g = svg.append("g")
                    .attr("transform",`translate(${m.left},${m.top})`);

    g.selectAll("rect")
        .data(all)
        .enter()
        .append("rect")
        .attr("y",d => y(d.label))
        .attr("height",y.bandwidth())
        .attr("width",d => x(d.count))
        .attr("fill",d => color(d.type));

    g.selectAll("text")
        .data(all)
        .enter()
        .append("text")
        .attr("x",d => x(d.count) + 4)
        .attr("y",d => y(d.label) + y.bandwidth() / 2 + 4)
        .text(d => d.count);

    g.append("g")
        .attr("class","axis")
        .call(d3.axisLeft(y));
    
    g.append("g")
        .attr("class","axis")
        .attr("transform",`translate(0,${h})`)
        .call(d3.axisBottom(x));
}

/* ---------- DIBUJAR RED ---------- */
function drawNetwork(nodes, links, highlightId){
    const svg = d3.select("#network"),
            width   = +svg.attr("width"),
            height  = +svg.attr("height");

    /* --- contenedor que se escalará/trasladará --- */
    const gZoom = svg.append("g");

    /* ---- fuerzas ---- */
    const sim = d3.forceSimulation(nodes)
                    .force("link", d3.forceLink(links).id(d=>d.id).distance(120))
                    .force("charge", d3.forceManyBody().strength(-200))
                    .force("center", d3.forceCenter(width/2,height/2));

    /* ---- aristas ---- */
    const link = gZoom.append("g")
                        .attr("stroke","#999").attr("stroke-opacity",.6)
                        .selectAll("line").data(links).enter().append("line")
                        .attr("stroke-width",1.2);

    /* ---- nodos ---- */
    const node = gZoom.append("g")
                        .attr("stroke","#fff").attr("stroke-width",1.5)
                        .selectAll("circle").data(nodes).enter().append("circle")
                            .attr("r", d => d.id===highlightId ? 10 : 5)
                            .attr("fill", d => d.id===highlightId ? "#e31a1c" : "#3182bd")
                            .call(drag(sim));                        // ← drag original

    /* ---- tooltips (igual que antes) ---- */
    const tip = d3.select("body")
                    .append("div")
                    .attr("class","tooltip")
                    .style("opacity",0);

    node.on("mouseover",(e,d)=>{
        tip.transition().style("opacity",.9);
        tip.html(`<strong>${d.label}</strong><br>${d.genre}`)
            .style("left",(e.pageX+10)+"px")
            .style("top",(e.pageY-28)+"px");
        })
        .on("mouseout",()=>tip.transition().style("opacity",0));

    /* ---- tick ---- */
    sim.on("tick",()=>{
        link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
            .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
        node.attr("cx",d=>d.x).attr("cy",d=>d.y);
    });

    /* ---- zoom + paneo ---- */
    const zoom = d3.zoom()
        .scaleExtent([0.1, 8])           // límites de zoom
        .on("zoom", (e)=> gZoom.attr("transform", e.transform));

    svg.call(zoom);                      // activa rueda, arrastre y doble-clic

    /* ---- drag helper ---- */
    function drag(sim){
        function start(evt){
            if (!evt.active) sim.alphaTarget(0.3).restart();
            evt.subject.fx = evt.subject.x;
            evt.subject.fy = evt.subject.y;
        }
        
        function move(evt){
            evt.subject.fx = evt.x;
            evt.subject.fy = evt.y;
        }
        
        function end(evt){
            if (!evt.active) sim.alphaTarget(0);
            evt.subject.fx = null;
            evt.subject.fy = null;
        }
        
        return d3.drag().on("start",start).on("drag",move).on("end",end);
    }
}