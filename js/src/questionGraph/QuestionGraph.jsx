import React, {
  useEffect, useRef, useMemo, useContext,
} from 'react';
import _ from 'lodash';
import shortid from 'shortid';

import getNodeCategoryColorMap from '../../utils/colorUtils';
import strings from '../../utils/stringUtils';
import BiolinkContext from '../../utils/biolinkContext';

const Graph = require('react-graph-vis').default;

// Default pre-processing method on each node object to return updated node obj
/* eslint-disable no-param-reassign */
function defaultNodePreProc(n) {
  n.chosen = false; // Not needed since borderWidth manually set below
  n.borderWidth = 1;
  if (n.is_set) {
    n.shadow = {
      enabled: true,
      size: 10,
      color: 'rgba(0,0,0,0.75)',
      x: -10,
      y: -10,
    };
  }
  if ((Array.isArray(n.curie) && n.curie.length)) {
    n.borderWidth = 2;
  }
  if (n.deleted) { // Set this node as hidden since it is flagged for deletion
    n.color = {
      border: '#aaa',
      background: '#eee',
      highlight: { background: '#eee', border: '#aaa' },
      hover: { background: '#eee', border: '#aaa' },
    };
    n.font = { color: '#d38f8f', ital: { color: '#910000', size: 13 } };
    n.shapeProperties = { borderDashes: [3, 1] };
  }

  // make user-displayed node label
  if ('name' in n) {
    n.label = `${n.id}: ${n.name}`;
  } else if (n.curie) {
    if (Array.isArray(n.curie)) {
      if (n.curie.length > 0) {
        n.label = `${n.id}: ${n.curie[0]}`; // eslint-disable-line prefer-destructuring
      } else {
        n.label = '';
      }
    } else {
      n.label = `${n.id}: ${n.curie}`;
    }
  } else if ('category' in n) {
    n.label = `${n.id}: ${strings.displayCategory(n.category)}`;
  } else if ('id' in n) {
    n.label = n.id;
  } else {
    n.label = '';
  }
  return n;
}

function defaultEdgePreProc(e) {
  let label = '';
  if ('predicate' in e) {
    if (Array.isArray(e.predicate)) {
      label = e.predicate.map((predicate) => strings.displayPredicate(predicate)).join(', ');
    } else {
      label = e.predicate;
    }
  }
  if (!('predicate' in e)) {
    e.arrows = {
      to: {
        enabled: false,
      },
    };
  }

  const smooth = { forceDirection: 'none' };

  e.from = e.subject;
  e.to = e.object;
  e.chosen = false;
  e.width = 1;
  const defaultParams = {
    label,
    labelHighlightBold: false,
    font: {
      color: '#000',
      align: 'top',
      strokeColor: '#fff',
    },
    smooth,
    arrowStrikethrough: false,
  };

  return { ...e, ...defaultParams };
}
/* eslint-enable no-param-reassign */

/**
 * Query graph view
 * @param {Object} question contains nodes and edges
 * @param {Boolean} selectable can you click on the graph
 * @param {Number} height height of the graph
 * @param {Number} width width of the graph
 * @param {Function} graphClickCallback what happens when you click on the graph
 * @param {Function} nodePreProcFn creation of each node properties
 * @param {Function} edgePreProcFn creation of each edge properties
 * @param {Boolean} interactable can you hover over nodes and get info
 */
export default function QuestionGraphView(props) {
  const {
    question = { nodes: [], edges: [] }, selectable = false, height = 250, width = '100%',
    graphClickCallback, nodePreProcFn = defaultNodePreProc, edgePreProcFn = defaultEdgePreProc,
    interactable = true,
  } = props;
  const network = useRef(null);
  const { concepts } = useContext(BiolinkContext);

  // Bind network fit callbacks to resize graph and cancel fit callbacks on start of zoom/pan
  function setNetworkCallbacks() {
    network.current.once('afterDrawing', () => network.current.fit());
    network.current.on('doubleClick', () => network.current.fit());
    network.current.on('zoom', () => network.current.off('afterDrawing'));
    network.current.on('dragStart', () => network.current.off('afterDrawing'));
  }

  useEffect(() => {
    if (selectable && network.current) {
      setNetworkCallbacks();
    }
  }, [network.current]);

  /* eslint-disable no-param-reassign */
  function getDisplayGraph() {
    const graph = _.cloneDeep(question);

    // Adds vis.js specific tags to manage colors in graph
    const nodeCategoryColorMap = getNodeCategoryColorMap(concepts);

    graph.nodes.forEach((n) => {
      let backgroundColor;
      if (Array.isArray(n.category)) {
        backgroundColor = nodeCategoryColorMap(n.category[0]);
      } else {
        backgroundColor = nodeCategoryColorMap(n.category);
      }
      n.color = {
        border: '#000000',
        background: backgroundColor,
        highlight: { background: backgroundColor, border: '#000000' },
        hover: { background: backgroundColor, border: '#000000' },
      };
    }); /* eslint-enable no-param-reassign */

    graph.nodes = graph.nodes.map(nodePreProcFn);
    graph.edges = graph.edges.map(edgePreProcFn);
    return graph;
  }

  function getDisplayOptions() {
    if (!question || !question.nodes || !question.edges) {
      return null;
    }
    const graph = _.cloneDeep(question);
    // potential change display depending on size/shape of graph
    let actualHeight = height;
    if (!(typeof actualHeight === 'string' || actualHeight instanceof String)) {
      // actualHeight is not a string must convert it
      actualHeight = `${actualHeight}px`;
    }

    // default layout (LR)
    let physics = false;
    let layout = {
      randomSeed: 0,
      hierarchical: {
        enabled: true,
        levelSeparation: 300,
        nodeSpacing: 200,
        treeSpacing: 200,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
        direction: 'LR',
        sortMethod: 'directed',
      },
    };

    // Switch to a simple quick spring layout without overlap
    if ((graph.nodes.length > 10) || (graph.edges.length > graph.nodes.length)) {
      physics = {
        minVelocity: 0.75,
        stabilization: {
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -300,
          centralGravity: 0.3,
          springLength: 200,
          springConstant: 0.05,
          damping: 0.95,
          avoidOverlap: 1,
        },
        timestep: 0.1,
        adaptiveTimestep: true,
      };
      layout = {
        randomSeed: 0,
        improvedLayout: true,
      };
    }

    let interaction = {
      zoomView: false,
      dragView: false,
      selectable: false,
      dragNodes: true,
    };
    if (interactable) {
      interaction = {
        hover: false,
        zoomView: true,
        dragView: true,
        hoverConnectedEdges: false,
        selectConnectedEdges: false,
        selectable,
        tooltipDelay: 50,
      };
    }

    return ({
      height: actualHeight,
      autoResize: true,
      layout,
      physics,
      edges: {
        color: {
          color: '#000',
          highlight: '#000',
          hover: '#000',
        },
        hoverWidth: 1,
        selectionWidth: 1,
      },
      nodes: {
        shape: 'box',
        labelHighlightBold: false,
      },
      interaction,
    });
  }

  const displayGraphDependencies = [question, nodePreProcFn, edgePreProcFn, graphClickCallback];
  const displayGraph = useMemo(getDisplayGraph, displayGraphDependencies);
  const displayOptions = useMemo(getDisplayOptions,
    displayGraphDependencies.concat([selectable, height, width, interactable]));

  return (
    <>
      {displayGraph !== null && (
        <Graph
          // TODO: this random key rerenders every time.
          // we want to do this better.
          key={shortid.generate()}
          graph={displayGraph}
          options={displayOptions}
          events={{ click: graphClickCallback }}
          getNetwork={(ref) => { network.current = ref; }} // Store network reference in the component
          style={{ width }}
        />
      )}
    </>
  );
}
