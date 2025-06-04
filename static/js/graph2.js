const svg = d3.select("#graph");
const width = parseInt(svg.style("width"));
const height = parseInt(svg.style("height"));

// Crear un grupo para los nodos y enlaces, trasladado al centro del svg
const g = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);


d3.json("/data/MC1_graph.json").then(data => {
  // Filtrar nodos con id < 100
  const nodes = data.nodes
    .filter(d => d.id < 100)
    .map(d => ({
      id: d.id,
      name: d.name,
      type: d["Node Type"]
    }));

  const simulation = d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(-100))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force("collision", d3.forceCollide(25))
    .on("tick", ticked);

  const node = svg.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 10)
    .attr("fill", d => {
      if (d.type === "Song") return "skyblue";
      if (d.type === "Person") return "orange";
      if (d.type === "RecordLabel") return "green";
      return "gray";
    });

  const label = svg.selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text(d => d.name);

  function ticked() {
    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x + 12)
      .attr("y", d => d.y + 4);
  }
});
