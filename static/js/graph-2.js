/* -------------  CONSTANTES  -------------------------------- */
const FILE = "MC1_graph.json";

const INFLUENCES_EDGES = new Set([
    "InStyleOf", "DirectlySamples", "CoverOf",
    "InterpolatesFrom", "LyricalReferenceTo"
]);

const INFLUENCES_ARTIST_EDGES = new Set([
    "PerformerOf", "ProducerOf", "LyricistOf"
]);

const legendBox  = d3.select("#legendBox");
const artistBox  = d3.select("#artistTable");   // ya existía, solo alias útil

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

    let genres, color;   // se rellenan en drawBoxChart

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

    function buildTimelineTable(yearData){
        legendBox.selectAll("*").remove();        // limpia el panel

        legendBox.append("h3")
                .attr("class","side-title")
                .text("Canciones influenciadas por año");

        const table = legendBox.append("table")
            .attr("class","artist-table");        // reaprovechamos estilo

        const thead = table.append("thead").append("tr");
        thead.append("th").text("Año");
        thead.append("th").text("Cantidad");

        const tbody = table.append("tbody");

        tbody.selectAll("tr")
            .data(yearData)
            .enter().append("tr")
                .html(d => `<td>${d.year}</td><td>${d.count}</td>`);
    }

    buildTimelineTable(yearCounts);


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

    d3.select("body").classed("loading", false);

    d3.select("#viewSelector").on("change", function(){
        setVisible(this.value);
    });

    function setVisible(view){
        d3.selectAll("svg.graph").style("display", "none");
        d3.selectAll("h2").style("display", "none");

        wrap.style("display", view === "box" ? "flex" : "none");

        // limpiar el panel derecho siempre
        legendBox.style("display", "none").selectAll("*").remove();
        artistBox.style("display", "none").selectAll("*").remove();

        if (view === "evolution") {
            d3.select("#evoNet").style("display", "block");
            d3.select("#evoCloud").style("display", "block");

        } else if (view === "box") {
            d3.select("#boxChart").style("display", "block");
            legendBox.style("display", null);  // ← activa leyenda

            if (!boxUpdater) {
                boxUpdater = drawInspirationChart();
                bPrev.on("click", () => step(-1));
                bNext.on("click", () => step(+1));
                bPlay.on("click", togglePlay);
            } else {
                buildBoxLegend(genres, color);
            }

        } else if (view === "bars") {
            d3.select("#bars").style("display", "block");
            artistBox.style("display", null);  // ← activa tabla de artistas

        } else if (view === "timeline") {
            d3.select("#timeline").style("display", "block");
            legendBox.style("display", null); // ← activa tabla de años
            buildTimelineTable(yearCounts);   // ← rellena la tabla
        }

        d3.select(`#title-${view}`).style("display", null);
    }

    /* =========================================================
    *  DIBUJAR TIMELINE
    * =======================================================*/
    function drawTimeline(data){
        const svg = d3.select("#timeline"),
            width  = +svg.attr("width"),
            height = +svg.attr("height"),

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
        svg.selectAll("*").remove();
        const g = svg.append("g")
            .attr("transform", `translate(${m.left},${m.top})`);

        /* ----- grillas de fondo (suaves) ----- */
        const xGrid = d3.axisBottom(x).ticks(6).tickSize(-h).tickFormat("");
        const yGrid = d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat("");

        g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${h})`)
        .call(xGrid);

        g.append("g")
        .attr("class", "grid")
        .call(yGrid);

        /* curva de área */
        g.append("path")
        .datum(data)
        .attr("fill", "#69b3a2")
        .attr("d", area);

        /* ejes */
        const xAxis = g.append("g")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        const yAxis = g.append("g")
            .call(d3.axisLeft(y));

        /* títulos de ejes */
        xAxis.append("text")
            .attr("x", w/2).attr("y", 40)
            .attr("fill","#000").attr("font-weight","bold")
            .attr("text-anchor","middle").text("Años");

        yAxis.append("text")
            .attr("transform","rotate(-90)")
            .attr("x", -h/2).attr("y", -m.left+20)
            .attr("fill","#000").attr("font-weight","bold")
            .attr("text-anchor","middle")
            .text("N° de canciones influenciadas");

        /* ---------- tooltip interactivo ---------- */
        const bisect = d3.bisector(d => d.year).left;      // búsqueda binaria

        const focus = g.append("circle")                   // marcador
            .attr("r", 4.5)
            .attr("fill", "#000")
            .style("display", "none");

        const overlay = g.append("rect")                   // capa capturadora
            .attr("width",  w)
            .attr("height", h)
            .attr("fill",   "none")
            .attr("pointer-events","all")
            .on("mousemove", moved)
            .on("mouseout",  () => {
                focus.style("display","none");
                d3.select("#tooltip").style("opacity",0);
            });

        function moved(event){
            const [mx] = d3.pointer(event);
            const year  = Math.round(x.invert(mx));        // año más cercano
            const idx   = bisect(data, year);
            const d0    = data[idx-1] || data[0];
            const d1    = data[idx]   || data[data.length-1];
            const d     = (year - d0.year) < (d1.year - year) ? d0 : d1; // punto más próximo

            focus.attr("cx", x(d.year))
                .attr("cy", y(d.count))
                .style("display", null);

            const page = d3.pointer(event, document.body); // coordenadas absolutas
            d3.select("#tooltip")
            .style("opacity", 1)
            .style("left",  (page[0] + 15) + "px")
            .style("top",   (page[1] + 15) + "px")
            .html(`<strong>${d.year}</strong><br>${d.count} canciones`);
        }
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

    function buildBoxLegend(genres, color){
        legendBox.selectAll("*").remove();

        const lg = legendBox.append("div");
        lg.append("h3").attr("class","side-title")
        .text("Género influencia dominante");

        genres.forEach(gname => {
            const row = lg.append("div")
                .style("display","flex")
                .style("align-items","center")
                .style("margin","4px 0");
            row.append("div")
                .style("width","14px")
                .style("height","14px")
                .style("margin-right","8px")
                .style("background-color", color(gname));
            row.append("span").text(gname);
        });
    }

    function drawInspirationChart () {
        /* ---- dimensiones y fuerzas ---- */
        const bandH = 28;            // alto de cada franja
        const r0    = 6;             // radio del nodo
        const yearFirst = 2024, yearLast = 2040;
        yearMin = yearFirst;
        yearMax = yearLast;

        /* ---- datos Oceanus Folk post-Sailor ---- */
        const ofRecent = nodes.filter(
            d => d.genre === "Oceanus Folk" && getYear(d) >= yearFirst
        );
        const byYear = d3.group(ofRecent, d => getYear(d));
        const years  = d3.range(yearFirst, yearLast + 1);

        /* ---- géneros externos dominantes ---- */
        genres = Array.from(
            new Set(condensed.map(l => byId.get(l.source)?.genre).filter(Boolean))
        ).concat("Sin influencia");

        color = d3.scaleOrdinal()
                .domain(genres)
                .range(d3.schemeTableau10.concat(d3.schemePaired)
                    .slice(0, genres.length));

        buildBoxLegend(genres, color);

        /* ---- canvas y escalas ---- */
        const m = { top: 40, right: 20, bottom: 50, left: 120 };
        const h = genres.length * bandH;
        const svg = d3.select("#boxChart")
                        .attr("height", h + m.top + m.bottom);

        const W = +svg.attr("width"),
                H = +svg.attr("height"),
                w = W - m.left - m.right;

        svg.selectAll("*").remove();
        const g = svg.append("g")
                    .attr("transform", `translate(${m.left},${m.top})`);

        const x = d3.scaleLinear().domain([yearFirst, yearLast]).range([0, w]);
        const y = d3.scaleBand().domain(genres).range([0, h]).padding(0.5);

        /* ---- ejes ---- */
        g.append("g")
        .attr("transform", `translate(0,${h})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        g.append("g").call(d3.axisLeft(y));

        g.append("text")
        .attr("x", w / 2).attr("y", h + 40)
        .attr("text-anchor", "middle").attr("font-weight", "bold")
        .text("Años");

        g.append("text")
        .attr("x", -h / 2).attr("y", -90)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle").attr("font-weight", "bold")
        .text("Género inspiración dominante");

        /* ---- línea guía del año ---- */
        const yearLine = g.append("line")
                            .attr("y1", 0).attr("y2", h)
                            .attr("stroke", "#000")
                            .attr("stroke-width", 1.2)
                            .attr("stroke-dasharray", "4 4");

        const yearLabel = g.append("text")
                            .attr("y", -12)
                            .attr("fill", "#000")
                            .attr("font-size", "16px")
                            .attr("font-weight", "bold")
                            .attr("text-anchor", "middle");

        /* ---- contenedor de nodos ---- */
        const nodeG = g.append("g");

        /* ---- slider y botones ---- */
        slider.attr("min", yearFirst).attr("max", yearLast)
                .attr("step", 1).property("value", yearFirst)
                .on("input", function () { update(+this.value); });

        bPrev.on("click", () => step(-1));
        bNext.on("click", () => step(+1));
        bPlay.on("click", togglePlay);

        function step(dir) {
            let yv = +slider.property("value") + dir;
            yv = Math.max(yearFirst, Math.min(yearLast, yv));
            slider.property("value", yv);
            update(yv);
        }

        /* ---- fuerza ---- */
        const sim = d3.forceSimulation()
                        .velocityDecay(0.3)
                        .force("x", d3.forceX(d => x(getYear(d))).strength(0.8))
                        .force("y", d3.forceY(d => y(getDominant(d))).strength(0.8))
                        .force("collide", d3.forceCollide(r0 + 1.5))
                        .on("tick", () => {
                        nodeG.selectAll("circle")
                            .attr("cx", d => d.x)
                            .attr("cy", d => d.y);
                        });

        function getDominant(song) {
            const inf = influencesByTarget.get(song.id) || [];
            return inf.length ? (byId.get(inf[0].source)?.genre || "Otro")
                            : "Sin influencia";
        }

        /* ---- actualización ---- */
        function update(year) {
            slider.property("value", year);

            const songs = years.filter(y => y <= year)
                            .flatMap(y => byYear.get(y) || []);

            const sel = nodeG.selectAll("circle").data(songs, d => d.id);
            sel.exit().remove();

            sel.enter().append("circle")
            .attr("r", r0)
            .attr("fill", d => color(getDominant(d)))
            .attr("stroke", "#fff").attr("stroke-width", 1)
            .on("mouseover", (e, d) => {
                const dom = getDominant(d);
                d3.select("#tooltip").style("opacity", 1)
                .html(`<strong>${d.name}</strong><br>${d.release_date}<br>${dom}`);
            })
            .on("mousemove", e => {
                d3.select("#tooltip")
                .style("left", (e.pageX + 12) + "px")
                .style("top",  (e.pageY + 12) + "px");
            })
            .on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

            yearLine.attr("x1", x(year)).attr("x2", x(year));
            yearLabel.attr("x", x(year)).text(year);

            sim.nodes(songs).alpha(0.7).restart();
        }

        update(yearFirst);
        return update;
    }
});