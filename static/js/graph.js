const svg = d3.select("#graph");
const width = parseInt(svg.style("width"));
const height = parseInt(svg.style("height"));

// Crear un grupo para los nodos y enlaces SIN translate inicial
const g = svg.append("g")
// .attr("transform", `translate(${width / 2}, ${height / 2})`);

// Variables para arrastre del canvas
let currentTransform = d3.zoomIdentity;

// Función de zoom + pan
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on("zoom", (event) => {
    currentTransform = event.transform;
    g.attr("transform", currentTransform);
  });

svg.call(zoom);

d3.json("/data/MC1_graph.json").then(data => {
  const nodes = data.nodes
    .filter(d => d.id < 100)
    .map(d => ({
      id: d.id,
      name: d.name,
      type: d["Node Type"]
    }));

  const nodeIds = new Set(nodes.map(d => d.id));

  const links = data.links.filter(
    d => nodeIds.has(d.source) && nodeIds.has(d.target)
  );

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-100))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force("collision", d3.forceCollide(25))
    .on("tick", ticked);

  const link = g.selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-width", 1.5);

  const node = g.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 10)
    .attr("fill", d => {
      if (d.type === "Song") return "skyblue";
      if (d.type === "Person") return "orange";
      if (d.type === "RecordLabel") return "green";
      return "gray";
    })
    .call(drag(simulation)); // drag individual de nodos

  const label = g.selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text(d => d.name)
    .attr("font-size", "10px")
    .attr("fill", "black");

  function ticked() {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x + 12)
      .attr("y", d => d.y + 4);
  }

  function drag(simulation) {
    return d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }
});
