export function h(tag, props, ...children) {
  const node = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "style") Object.assign(node.style, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function fill(node, ...children) {
  if (!node) return node;
  node.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export function setText(selector, value) {
  const node = typeof selector === "string" ? $(selector) : selector;
  if (node) node.textContent = value;
  return node;
}

export function show(node, visible = true) {
  if (node) node.hidden = !visible;
  return node;
}
