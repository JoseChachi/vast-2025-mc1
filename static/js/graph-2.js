/* -------------  CONSTANTES  -------------------------------- */
const FILE = "MC1_graph.json";

const INFLUENCES_EDGES = new Set([
    "InStyleOf", "DirectlySamples", "CoverOf",
    "InterpolatesFrom", "LyricalReferenceTo"
]);

const INFLUENCES_ARTIST_EDGES = new Set([
    "PerformerOf", "ProducerOf", "LyricistOf"
]);

d3.json(`/data/${FILE}`).then(data => {
    // los nombres de las claves vienen exactamente así:
    const nodes = data.nodes;
    const links = data.links || [];

    /* Indexación útil */
    const byId = new Map(nodes.map(d => [d.id, d]));
    const oceanusIds = new Set(nodes.filter(d => d.genre === "Oceanus Folk" && d["Node Type"] === "Song")
                                    .map(d => d.id));

    const sailorShiftId = nodes.find(d => d.id === "Sailor Shift")?.id;
    const getYear = d =>
                    d && d.release_date            // ¿tenemos objeto y fecha?
                        ? parseInt(String(d.release_date).slice(0,4), 10)
                        : null;                      // ← devuelve null si falta
    
    const sailorShiftNode = byId.get(sailorShiftId);
    const SAILOR_YEAR     = getYear(sailorShiftNode) || 2024;   // 2024 por defecto

    let boxUpdater = null;      // update(year) que devuelve drawBoxChart
    let yearMin, yearMax;       // se rellenan la primera vez que se pinta
    let playing  = false;
    let timer    = null;

    let wrap = d3.select("#yearBoxWrap");
    if (wrap.empty()){                       // si no existe, lo creamos
        wrap = d3.select("body")
                .append("div")
                .attr("id","yearBoxWrap")
                .style("display","none")      // arranca oculto
                .style("margin","8px 0")
                .style("gap","8px")
                .style("align-items","center")
                .style("flex-wrap","nowrap")
                .style("display","flex");

        // slider
        wrap.append("input")
            .attr("id","yearBoxSlider")
            .attr("type","range")
            .style("width","260px");

        // botones ⏮ ⏯ ⏭
        wrap.append("div")
            .style("display","flex")
            .style("gap","4px")
            .html(`
                <button id="bPrev">⏮</button>
                <button id="bPlay">⏯</button>
                <button id="bNext">⏭</button>
            `);
    }

    /* referencias globales */
    const slider = d3.select("#yearBoxSlider");
    const bPrev  = d3.select("#bPrev");
    const bPlay  = d3.select("#bPlay");
    const bNext  = d3.select("#bNext");


    /* =========================================================
   * 1. TIMELINE (difusión intermitente o gradual)
   * =======================================================*/
    const extInfluenced = [];

    links.forEach(l => {
        if (INFLUENCES_EDGES.has(l["Edge Type"])) {
        const sourceIsOceanus = oceanusIds.has(l.source);
        const targetIsOceanus = oceanusIds.has(l.target);
        if (sourceIsOceanus ^ targetIsOceanus) {
            const other = byId.get(sourceIsOceanus ? l.target : l.source);
            if (other?.release_date) extInfluenced.push(other);
        }
        }
    });

    const yearCounts = Array.from(
        d3.rollup(extInfluenced, v => v.length, d => getYear(d)),
        ([year, count]) => ({ year, count })
    ).sort((a, b) => a.year - b.year);

    drawTimeline(yearCounts);


    /* =========================================================
   * 2. BARRAS  (géneros + artistas ÚNICOS)
   * =======================================================*/
    function getArtistsForSong(songId){
        const artists = new Set();

        /* a) Enlaces directos a la canción */
        links.forEach(l => {
        if (INFLUENCES_ARTIST_EDGES.has(l["Edge Type"]) &&
            l.target === songId) artists.add(l.source);
        });

        /* b) Enlaces vía otra canción influyente */
        links.forEach(l => {
        if (INFLUENCES_EDGES.has(l["Edge Type"]) &&
            l.target === songId){

            const otherSong = l.source;
            links.forEach(l2 => {
            if (INFLUENCES_ARTIST_EDGES.has(l2["Edge Type"]) &&
                l2.target === otherSong) artists.add(l2.source);
            });
        }
        });

        /* → nombres únicos, depurando nulos */
        return Array.from(artists)
                    .map(id => byId.get(id)?.name)
                    .filter(Boolean);
    }

    const genreArtistMap = new Map();

    extInfluenced.forEach(song => {
        const genre   = song.genre || "Otro";
        const artists = getArtistsForSong(song.id);

        if (!genreArtistMap.has(genre)) genreArtistMap.set(genre, new Set());
        artists.forEach(a => genreArtistMap.get(genre).add(a));
    });

    const genreData = Array.from(genreArtistMap, ([genre, set]) => ({
                        genre,
                        artists: Array.from(set),
                        count : set.size
                        }))
                        .sort((a, b) => d3.descending(a.count, b.count));

    drawBars(genreData);

    /* ----------  SELECTOR DE VISTA  ------------------------- */
    setVisible("timeline");        // vista inicial

    d3.select("#viewSelector").on("change", function(){
        setVisible(this.value);
    });

    function setVisible(view){
        d3.selectAll("svg.graph").style("display","none");
        d3.select("#artistTable").style("display","none");
        d3.selectAll("h2").style("display","none");

        wrap.style("display", view==="box" ? "flex" : "none");

        if (view === "evolution"){
            d3.select("#evoNet").style("display","block");
            d3.select("#evoCloud").style("display","block");
        } else if (view === "box"){
            d3.select("#boxChart").style("display","block");
            // solo la primera vez que entro creo la gráfica y obtengo update
            if (!boxUpdater){
                boxUpdater = drawBoxChart();  // y obtengo su update(year)
                
                bPrev .on("click", () => step(-1));
                bNext .on("click", () => step(+1));
                bPlay .on("click", togglePlay);
            }
        } else {
            d3.select(`#${view}`).style("display","block");
            if (view === "bars") d3.select("#artistTable").style("display",null);
        }
        d3.select(`#title-${view}`).style("display",null);
    }

    /* =========================================================
    *  DIBUJAR TIMELINE
    * =======================================================*/
    function drawTimeline(data){
        const svg = d3.select("#timeline"),
            width  = +svg.attr("width"),
            height = +svg.attr("height"),

            /* margen inferior y lateral algo mayores
                para que quepan los títulos de los ejes */
            m = {top:20, right:20, bottom:50, left:60},
            w = width  - m.left - m.right,
            h = height - m.top  - m.bottom;

        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.year))
            .range([0, w]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.count)]).nice()
            .range([h, 0]);

        const area = d3.area()
            .x(d => x(d.year))
            .y0(h)
            .y1(d => y(d.count))
            .curve(d3.curveMonotoneX);

        /* ---------- lienzo ---------- */
        svg.selectAll("*").remove();                      // limpia si se redibuja
        const g = svg.append("g")
            .attr("transform", `translate(${m.left},${m.top})`);

        g.append("path")
            .datum(data)
            .attr("fill", "#69b3a2")
            .attr("d", area);

        /* ---------- ejes ---------- */
        const xAxis = g.append("g")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        const yAxis = g.append("g")
            .call(d3.axisLeft(y));

        /* ---------- títulos de los ejes ---------- */
        xAxis.append("text")
            .attr("x", w / 2)
            .attr("y", 40)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .text("Años");

        yAxis.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -h / 2)
            .attr("y", -m.left + 20)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .text("N° de canciones influenciadas");
    }

    /* =========================================================
    *  DIBUJAR BARRAS (género → artistas)
    * =======================================================*/
    function drawBars(data){
        const svg = d3.select("#bars"),
            width  = +svg.attr("width"),
            height = +svg.attr("height"),

            /* margen inferior y lateral algo mayores
                para que quepan los títulos de los ejes  */
            m = {top:20, right:20, bottom:50, left:180},
            w = width  - m.left - m.right,
            h = height - m.top  - m.bottom;

        const y = d3.scaleBand()
            .domain(data.map(d => d.genre))
            .range([0, h])
            .padding(0.15);

        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.count)]).nice()
            .range([0, w]);

        /* ---------- lienzo ---------- */
        svg.selectAll("*").remove();                // limpia si se vuelve a dibujar
        const g = svg.append("g")
            .attr("transform", `translate(${m.left},${m.top})`);

        /* ---------- barras ---------- */
        const barColor = "#0d6efd";                 // azul "representativo" único

        g.selectAll("rect")
            .data(data)
            .enter().append("rect")
                .attr("y", d => y(d.genre))
                .attr("height", y.bandwidth())
                .attr("width",  d => x(d.count))
                .attr("fill",   barColor)
                .style("cursor","pointer")
                .on("click", (_, d) => showTable(d));

        /* ---------- ejes ---------- */
        const xAxis = g.append("g")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(x));

        const yAxis = g.append("g")
            .call(d3.axisLeft(y));

        /* títulos de los ejes */
        xAxis.append("text")
            .attr("x", w / 2)
            .attr("y", 40)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .attr("font-size", "15px")
            .text("Número de artistas");

        yAxis.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -h / 2)
            .attr("y", -m.left + 20)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .attr("font-size", "15px")
            .text("Géneros");
    }

    /* =========================================================
   *  TABLA DE ARTISTAS
   * =======================================================*/
    function showTable(d){
        const cont = d3.select("#artistTable");
        cont.selectAll("*").remove();

        cont.append("h3")
            .text(`Artistas influenciados en ${d.genre} (${d.count})`);

        const table = cont.append("table").attr("class","artist-table");
        table.append("thead").append("tr").append("th").text("Artista");

        table.append("tbody")
            .selectAll("tr")
            .data(d.artists)
            .enter().append("tr")
            .append("td").text(a => a);
    }

    /* =========================================================
    * 3. CAJA ÚNICA ACUMULATIVA
    * ---------------------------------------------------------*/

    /* ----------  Pre-cálculo de influencias condensadas  ------ */
    const influCand = links.filter(l =>
        INFLUENCES_EDGES.has(l["Edge Type"]) &&
        oceanusIds.has(l.target) &&
        byId.has(l.source)               // ← descarta huérfanos
    );

    const TOP_K = 2;
    const condensed = [];
    d3.rollups(
        influCand,
        v => v.sort((a,b)=>
                (+byId.get(a.source).release_date||0) -
                (+byId.get(b.source).release_date||0)
            ).slice(0,TOP_K),
        l => l.target
    ).forEach(([,arr])=> condensed.push(...arr));

    const influencesByTarget = d3.group(condensed, l => l.target);

    function step(dir){
        let y = +slider.property("value") + dir;
        y = Math.max(yearMin, Math.min(yearMax, y));
        slider.property("value", y);
        boxUpdater(y);       
    }

    function togglePlay(){
        playing = !playing;
        bPlay.text( playing ? "⏸" : "⏯" );
        if (playing){
            timer = setInterval(()=>step(+1), 1200); // avanza 1 año / 1.2 s
        }else{
            clearInterval(timer);
        }
    }

    function drawBoxChart(){
        /* ---- parámetros visuales ---- */
        const boxW = 360, col = 12, r0 = 6,
                padX = 10, padY = 10;

        /* ---- datos pos-Sailor ---- */
        const ofRecent = nodes.filter(d =>
                            d.genre === "Oceanus Folk" && getYear(d) >= SAILOR_YEAR);

        const byYear = d3.group(ofRecent, d => getYear(d));
        const years  = Array.from(byYear.keys()).sort(d3.ascending);
        console.log("Años post-Sailor:", years);   // ←
        yearMin = years[0]; 
        yearMax = years.at(-1);

        /* ---- paleta de géneros externos ---- */
        const genres = Array.from(
                new Set(condensed.map(l=>byId.get(l.source)?.genre).filter(Boolean))
            ).concat("Sin influencia");

        const color = d3.scaleOrdinal()
                .domain(genres)
                .range(d3.schemeTableau10.concat(d3.schemePaired)
                    .slice(0, genres.length));

        /* ---- lienzo ---- */
        const svg = d3.select("#boxChart"),
                W = +svg.attr("width"),
                H = +svg.attr("height"),
                m = {top:50,right:200,bottom:60,left:60},
                w = W-m.left-m.right,
                h = H-m.top-m.bottom;

        svg.selectAll("*").remove();
        const g = svg.append("g").attr("transform",`translate(${m.left},${m.top})`);

        /* ---- caja gris ---- */
        const boxG = g.append("g")
                .attr("transform",`translate(${(w-boxW)/2},${h})`);

        const rect = boxG.append("rect")
                .attr("width",boxW).attr("y",-1).attr("height",1)
                .attr("fill","#ececec").attr("stroke","#666");

        /* ---- leyenda ---- */
        const lg = svg.append("g")
                .attr("transform",`translate(${W-m.right+10},${m.top})`)
                .attr("font-family","sans-serif").attr("font-size","11px");

        genres.forEach((gname,i)=>{
            lg.append("rect").attr("x",0).attr("y",i*18)
                .attr("width",14).attr("height",14)
                .attr("fill",color(gname));
            lg.append("text").attr("x",20).attr("y",i*18+11).text(gname);
        });
        lg.append("text").attr("x",0).attr("y",-10)
            .attr("font-weight","bold").text("Género influencia dominante");

        /* ---- indicador ---- */
        const info = svg.append("text")
                .attr("x",m.left).attr("y",20)
                .attr("font-family","sans-serif")
                .attr("font-size","14px")
                .attr("font-weight","bold");

        /* ---- data-join de bolas ---- */
        const circles = boxG.selectAll("circle");

        /* ▸ simulación con fuerza de colisión */
        const sim = d3.forceSimulation()
                    .velocityDecay(0.4)       // un poco de fricción
                    .alphaDecay(0.05)         // se calma rápido
                    .force("collide", d3.forceCollide(r0+1.5));

        const slider = d3.select("#yearBoxSlider")
            .attr("min",   yearMin)
            .attr("max",   yearMax)
            .attr("step",  1)
            .property("value", yearMin)          // ← usa property, no attr
            .on("input", function () {
                update(+this.value);             // se refresca al mover la manija
        });

        slider.on("input", function () {
            update(+this.value);        // this.value siempre es un número válido
        });

        /* ---- función de actualización ---- */
        function update(year){

            slider.property("value", year);

            /* canciones acumuladas ≤ año */
            const songs = years.filter(y=>y<=year)
                            .flatMap(y=>byYear.get(y)||[])
                            .sort((a,b)=> String(a.id).localeCompare(String(b.id)));

            /* contador */
            const totalInfl = songs.reduce((acc,s)=>
                acc + (influencesByTarget.get(s.id)||[]).length, 0);
            info.text(`Año ${year}: ${songs.length} canciones · ${totalInfl} influencias externas`);

            /* tamaño de caja */
            const rows = Math.ceil(songs.length/col);
            const boxH = rows ? rows*(r0*2+4)+padY*2 : 0;
            rect.attr("y",-boxH).attr("height",boxH);

            /* ----------- JOIN con física ----------- */
            const sel = boxG.selectAll("circle")
                            .data(songs, d => d.id);

            /* EXIT – quita canciones que desaparecen al retroceder */
            sel.exit().remove();

            /* ENTER – nuevas pelotas */
            const enter = sel.enter().append("circle")
                .attr("r", r0)
                .attr("fill", d => {
                    const inf  = influencesByTarget.get(d.id) || [];
                    const gExt = inf.length ? (byId.get(inf[0].source)?.genre || "Otro")
                                            : "Sin influencia";
                    return color(gExt);
                })
                .attr("stroke","#fff").attr("stroke-width",1)
                .each(d => {             // posición inicial al azar dentro de la caja
                    d.x = Math.random()*boxW;
                    d.y = -Math.random()*boxH;
                })
                /* tooltip */
                .on("mouseover", (e,d)=>{
                    const inf = influencesByTarget.get(d.id)||[];
                    const gExt = inf.length ? (byId.get(inf[0].source)?.genre || "Otro")
                                            : "Sin influencia";
                    d3.select("#tooltip").style("opacity",1)
                        .html(`<b>${d.name}</b><br>${d.release_date}<br>
                            Infl.: ${inf.length}<br>${gExt}`);
                })
                .on("mousemove", e=>{
                    d3.select("#tooltip")
                    .style("left",(e.pageX+12)+"px")
                    .style("top" ,(e.pageY+12)+"px");
                })
                .on("mouseout", ()=> d3.select("#tooltip").style("opacity",0));

            /* (re)arranca la simulación con las canciones visibles */
            sim.nodes(songs)
            .force("center", d3.forceCenter(boxW/2, -boxH/2))
            .alpha(0.7).restart();

            /* (re)arranca la simulación con las canciones visibles */
            sim.nodes(songs)
                .force("center", d3.forceCenter(boxW/2, -boxH/2))
                .alpha(0.7)
                .restart();

            /* tick: dibuja cada paso y mantiene las pelotas dentro de la caja */
            sim.on("tick", () => {
                boxG.selectAll("circle")
                    .attr("cx", d => d.x = Math.max(padX + r0,        Math.min(boxW - padX - r0, d.x)))
                    .attr("cy", d => d.y = Math.max(-boxH + padY + r0, Math.min(-padY - r0,       d.y)));
            });
        }

        /* --- estado inicial con 2024 --- */
        slider.node().value = yearMin;
        update(yearMin);

        return update;
    }
});