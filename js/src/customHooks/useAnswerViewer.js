/* eslint-disable no-param-reassign */
import { useState, useEffect } from 'react';
import _ from 'lodash';

import entityNameDisplay from '../../utils/entityNameDisplay';
import useFilter from './useFilter';
import config from '../../config.json';

const makeEmptyArray = (len, init) => {
  const array = new Array(len);
  for (let i = 0; i < len; i += 1) array[i] = init;
  return array;
};

export default function useAnswerViewer(msg) {
  const [message, updateMessage] = useState(msg);
  // const [activeAnswerId, updateActiveAnswerId] = useState(null);
  // const [denseAnswer, updateDenseAnswer] = useState({});
  const [numAgSetNodes, updateNumAgSetNodes] = useState(10);
  const [idToIndMaps, setIdToIndMaps] = useState(null);
  const [filter, setFilter] = useState({});
  const [filterKeys, setFilterKeys] = useState({});
  const [searchedFilter, updateSearchedFilter] = useState({});
  const [filteredAnswers, setFilteredAnswers] = useState({});

  useEffect(() => {
    message.results.forEach((a, i) => {
      if (!a.id) {
        a.id = i;
      }
    });
    // updateActiveAnswerId(message.results[0].id);
  }, []);

  const keyBlacklist = ['isSet', 'labels', 'equivalent_identifiers', 'type', 'id', 'degree'];
  let unknownNodes = false;

  function graphToIndMap(graph, type) {
    const indMap = new Map();
    if (message[graph]) {
      message[graph][type].forEach((t, i) => indMap.set(t.id, i));
    }
    return indMap;
  }

  function makeMaps() {
    const kgNodeMap = graphToIndMap('knowledge_graph', 'nodes');
    const kgEdgeMap = graphToIndMap('knowledge_graph', 'edges');
    const qgNodeMap = graphToIndMap('query_graph', 'nodes');
    const qgEdgeMap = graphToIndMap('query_graph', 'edges');
    setIdToIndMaps({
      kgNodeMap, kgEdgeMap, qgNodeMap, qgEdgeMap,
    });
    message.query_graph.nodes.forEach((node) => {
      if (!node.type && node.curie) {
        // if no node type, go look up in knowledge graph
        const kgNodeInd = kgNodeMap.get(node.curie);
        // TODO: don't just grab the first type from the array
        [node.type] = message.knowledge_graph.nodes[kgNodeInd].type;
      }
    });
  }

  useEffect(() => {
    makeMaps();
  }, []);

  function ansIdToIndMap() {
    const indMap = new Map();
    if (message.results) {
      message.results.forEach((ans, i) => indMap.set(ans.id, i));
    }
    return indMap;
  }

  /**
   * Number of graph nodes
   * @param {object} graph graph from message
   * @returns {int} number of nodes in graph
   */
  function numNodes(graph) {
    return message[graph] ? message[graph].nodes.length : 0;
  }
  function getGraphNode(graph, nodeId) {
    return graph.nodes.find((node) => node.id === nodeId);
  }
  function getGraphEdge(graph, edgeId) {
    return graph.edges.find((edge) => edge.id === edgeId);
  }

  function getQNodeIds() {
    const qNodeIds = [];
    message.query_graph.nodes.forEach((n) => {
      qNodeIds.push(n.id);
    });
    return qNodeIds;
  }
  function getQEdgeIds() {
    const qEdgeIds = [];
    message.query_graph.edges.forEach((e) => {
      qEdgeIds.push(e.id);
    });
    return qEdgeIds;
  }

  function getQgNode(id) {
    return message.query_graph.nodes[idToIndMaps.qgNodeMap.get(id)];
  }

  function getKgNode(nodeId) {
    return message.knowledge_graph.nodes[idToIndMaps.kgNodeMap.get(nodeId)];
  }

  function annotatedPrunedKnowledgeGraph(pruneNum) {
    if (message.query_graph) {
      // KG nodes don't always have type
      // If they don't we need to figure out which qNodes they most like correspond to
      // Then check labels and use the corresponding type

      const { results, knowledge_graph: kg, query_graph: qg } = message;
      const numQgNodes = numNodes('query_graph');
      const Nj = Math.round(pruneNum / numQgNodes);

      // Create a map between qGraph index to node id (for scoreVector)
      const qgNodeIndToIdMap = {};
      qg.nodes.forEach((node, i) => {
        qgNodeIndToIdMap[i] = node.id;
      });

      // Object map mapping qNodeId to Array of Objects of score info
      // of format { scoreVector, aggScore, kGNodeId }
      // eg: {"node01": [{ scoreVector, aggScore, id }, ...], "node02": [{ scoreVector, aggScore, id }, ...]}
      const qgNodeIdToScoreObjArrMap = {};
      idToIndMaps.qgNodeMap.forEach((qNodeInd, qNodeId) => (qgNodeIdToScoreObjArrMap[qNodeId] = []));

      const qgNodeIdToCountMap = {};
      idToIndMaps.qgNodeMap.forEach((qNodeInd, qNodeId) => (qgNodeIdToCountMap[qNodeId] = []));

      // Iterate through each node in knowledgeGraph and score them
      kg.nodes.forEach((node) => {
        const kgNode = _.cloneDeep(node);
        kgNode.scoreVector = makeEmptyArray(numQgNodes, 0);
        kgNode.count = makeEmptyArray(numQgNodes, 0);
        // Iterate through each answer
        results.forEach((ans) => {
          const { node_bindings: nodeBindings } = ans;
          // Iterate through each node_binding in an answer and if the KG node matches any, update score
          Object.keys(nodeBindings).forEach((nodeBinding) => {
            let isMatch = false;
            if (Array.isArray(nodeBindings[nodeBinding])) {
              if (nodeBindings[nodeBinding].indexOf(kgNode.id) > -1) {
                isMatch = true;
              }
            } else if (nodeBindings[nodeBinding] === kgNode.id) {
              isMatch = true;
            }
            // Update score for qNode position in scoreVector since this kGNode was
            // referenced in this answer
            // sometimes results don't have scores
            if (isMatch) {
              kgNode.count[idToIndMaps.qgNodeMap.get(nodeBinding)] += 1;
              if (ans.score !== undefined) {
                kgNode.scoreVector[idToIndMaps.qgNodeMap.get(nodeBinding)] += ans.score;
              }
            }
          });
        });
        kgNode.aggScore = kgNode.scoreVector.reduce((a, b) => a + b, 0);
        // Update qgNodeIdToScoreObjArrMap with this node for any non-zero
        // qNodeScore (Meaning that this node was referenced one or more times by
        // the corresponding qNode for qNodeInd)
        kgNode.scoreVector.forEach((qNodeScore, qNodeInd) => {
          if (qNodeScore > 0) {
            qgNodeIdToScoreObjArrMap[qgNodeIndToIdMap[qNodeInd]].push({
              scoreVector: kgNode.scoreVector, aggScore: kgNode.aggScore, id: kgNode.id,
            });
          }
        });
        kgNode.count.forEach((count, qNodeInd) => {
          if (count > 0) {
            qgNodeIdToCountMap[qgNodeIndToIdMap[qNodeInd]].push({
              count, id: kgNode.id,
            });
          }
        });
      });

      let rankedQgNodeMap = qgNodeIdToScoreObjArrMap;
      let hasScores = true;
      Object.values(qgNodeIdToScoreObjArrMap).forEach((arr) => {
        if (!arr.length) {
          hasScores = false;
        }
      });
      if (!hasScores) {
        rankedQgNodeMap = qgNodeIdToCountMap;
      }

      // Now sort for each qNode, by aggScore and retain a max of Nj nodes for each qNodeId
      let extraNumNodes = 0; // Increment if any qNodeId utilizes less than Nj nodes
      let unselectedScoreObjArrMap = []; // Array of { scoreVector, aggScore, kGNodeId } objects that were not selected
      Object.keys(rankedQgNodeMap).forEach((qGraphNodeId) => {
        rankedQgNodeMap[qGraphNodeId] = _.uniqBy(rankedQgNodeMap[qGraphNodeId], (el) => el.id); // Remove dup nodes
        rankedQgNodeMap[qGraphNodeId] = _.reverse(_.sortBy(rankedQgNodeMap[qGraphNodeId], (el) => el.aggScore || el.count));
        const numQGraphNodes = rankedQgNodeMap[qGraphNodeId].length;
        if (numQGraphNodes < Nj) {
          extraNumNodes += Nj - numQGraphNodes;
        } else {
          unselectedScoreObjArrMap = unselectedScoreObjArrMap.concat(rankedQgNodeMap[qGraphNodeId].slice(Nj));
          rankedQgNodeMap[qGraphNodeId] = rankedQgNodeMap[qGraphNodeId].slice(0, Nj);
        }
      });

      // Construct list of all nodeIds for final pruned knowledgeGraph
      let prunedKGNodeIds = [];
      Object.keys(rankedQgNodeMap).forEach((qGraphNodeId) => {
        rankedQgNodeMap[qGraphNodeId].forEach((scoreObj) => prunedKGNodeIds.push(scoreObj.id));
      });
      const numExtraNodesToGrab = pruneNum - prunedKGNodeIds.length;
      // If extraNodes available to be populated, sort unselectedScoreObjArrMap and
      // pick max remaining nodes to pick and add their ids to selectedNodeIdSet
      // TODO: This step can result in all extra nodes from a single qNode that has high AggScore (eg node6 in message_test.json)
      if (numExtraNodesToGrab > 0) {
        unselectedScoreObjArrMap = _.uniqBy(unselectedScoreObjArrMap, (el) => el.id);
        unselectedScoreObjArrMap = _.reverse(_.sortBy(unselectedScoreObjArrMap, (el) => el.aggScore));
        prunedKGNodeIds = prunedKGNodeIds.concat(unselectedScoreObjArrMap.slice(0, numExtraNodesToGrab).map((el) => el.id));
      }

      // Construct prunedKgNodeList
      const prunedKgNodeList = prunedKGNodeIds.map((kgNodeId) => kg.nodes[idToIndMaps.kgNodeMap.get(kgNodeId)]);
      const prunedKgNodeIdSet = new Set(prunedKgNodeList.map((node) => node.id));
      // Construct pruned edges from original KG-graph
      const prunedKgEdgeList = kg.edges.filter((edge) => {
        if (prunedKgNodeIdSet.has(edge.source_id) && prunedKgNodeIdSet.has(edge.target_id)) {
          return true;
        }
        return false;
      });

      const prunedGraph = {
        nodes: prunedKgNodeList,
        edges: prunedKgEdgeList,
      };

      // Now set correct type for nodes by going through answers and
      // allowing for majority vote across all answers for the type
      const qNodes = qg.nodes;
      const qNodeBindings = qNodes.map((q) => q.id);

      prunedGraph.nodes.forEach((node) => {
        if ((('type' in node) && Array.isArray(node.type)) || (!('type' in node) && ('labels' in node))) {
          // if a prunedGraph node doesn't have a type
          // We will look through all answers
          // We will count the number of times is used in each qNode
          // Then take the max to pick the best one
          // The type is then the type of that qNode
          const qNodeCounts = qNodeBindings.map(() => 0);

          results.forEach((a) => {
            // Go through answers and look for this node
            Object.keys(a.node_bindings).forEach((key) => {
              const theseIds = a.node_bindings[key];
              if (Array.isArray(theseIds)) {
                // This answer has a set of nodes for this binding
                if (theseIds.includes(node.id)) {
                  // The set contains this id
                  qNodeCounts[qNodeBindings.indexOf(key)] += 1;
                }
              } else if (theseIds === node.id) {
                // This answer lists this node as qNode: key
                qNodeCounts[qNodeBindings.indexOf(key)] += 1;
              }
            });
          });
          // See what question node this was mapped to most
          const maxCounts = qNodeCounts.reduce((m, val) => Math.max(m, val));
          const qNodeIndex = qNodeCounts.indexOf(maxCounts);
          // level is added to let the user display the graph hierarchically
          node.level = qNodeIndex;

          // Use that numQgNodes Nodes Type
          node.type = qNodes[qNodeIndex].type;
          if (node.type === 'named_thing') { // we don't actually want any named_things
            let kgNodeType = getKgNode(node.id).type;
            if (!Array.isArray(kgNodeType)) { // so the type will always be an array
              kgNodeType = [kgNodeType];
            }
            node.type = kgNodeType;
          }
        }
      });

      return prunedGraph;
    }
    return {};
  }

  // Returns formatted answerset data for tabular display
  // {
  //   answers: [{ nodes: {n0: {name: , id: , type: , isSet, setNodes?: }, n1: {}, ...}, score: -1 }, {}, ...],
  //   columnHeaders: [{ Header: 'n01: Gene', id: 'n01', isSet: false, type: 'gene'}, {}, ...],
  // }
  function answerSetTableData() {
    const columnHeaders = [];
    const answers = [];
    // set the column headers object
    message.query_graph.nodes.forEach((n) => {
      columnHeaders.push({
        Header: `${n.id}: ${entityNameDisplay(n.type)}`,
        id: n.id,
        isSet: n.set,
        type: n.type,
      });
    });
    // get the names and score from each answer for the table
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      const answer = {};
      Object.keys(nodeBindings).forEach((qnodeId) => {
        let kNodeIds = nodeBindings[qnodeId];
        if (!Array.isArray(kNodeIds)) {
          kNodeIds = [kNodeIds];
        }
        answer[qnodeId] = [];
        kNodeIds.forEach((kNodeId) => {
          const kNode = getKgNode(kNodeId);
          if (kNode) {
            answer[qnodeId].push({
              name: kNode.name,
              id: kNode.id,
            });
          } else {
            answer[qnodeId].push({
              name: 'Missing Node',
            });
            unknownNodes = true;
          }
        });
      });
      answer.score = ans.score;
      answer.id = ans.id;
      answers.push(answer);
    });
    return { columnHeaders, answers };
  }

  // builds dense answer
  function getDenseAnswer(answerId) {
    const qNodeIds = getQNodeIds();
    const qEdgeIds = getQEdgeIds();
    const kg = message.knowledge_graph;
    const { kgEdgeMap } = idToIndMaps;
    const answer = message.results[answerId];
    const ansObj = {
      score: answer.score, nodes: {}, edges: {}, id: answer.id,
    };
    qNodeIds.forEach((qNodeId) => {
      const qNode = getQgNode(qNodeId);
      let nodeListObj = { type: qNode.type, isSet: false };
      const knodeIds = answer.node_bindings[qNodeId];
      if (!Array.isArray(knodeIds)) {
        // This is not a set node
        if (('set' in qNode) && qNode.set) {
          // Actually a set but only has one element
          nodeListObj = { type: qNode.type, name: `Set: ${entityNameDisplay(qNode.type)}`, isSet: true };
          nodeListObj.setNodes = [knodeIds].map((kgNodeId) => getKgNode(kgNodeId));
        } else {
          // for real, not a set
          nodeListObj = { ...getKgNode(knodeIds), ...nodeListObj };
        }
      } else if ((knodeIds.length === 1) && !qNode.set) {
        // This is not a set node but, for some reason is an array

        nodeListObj = { ...getKgNode(knodeIds[0]), ...nodeListObj };
      } else {
        // Set
        nodeListObj = { type: qNode.type, name: `Set: ${entityNameDisplay(qNode.type)}`, isSet: true };
        nodeListObj.setNodes = knodeIds.map((kgNodeId) => getKgNode(kgNodeId));
      }
      ansObj.nodes[qNodeId] = nodeListObj;
    });
    qEdgeIds.forEach((qEdgeId) => {
      let cEdgeIds = [];
      if (!Array.isArray(answer.edge_bindings[qEdgeId])) { // Just a single id
        cEdgeIds = [answer.edge_bindings[qEdgeId]];
      } else { // we already have an array.
        cEdgeIds = answer.edge_bindings[qEdgeId];
      }
      ansObj.edges[qEdgeId] = cEdgeIds.map((eid) => kg.edges[kgEdgeMap.get(eid)]);
    });

    return ansObj;
  }

  // Returns subgraphViewer compatible format graph spec { nodes: {}, edges: {} }
  function activeAnswerGraph(activeAnswerId) {
    const ansIdMap = ansIdToIndMap();
    const answer = message.results[ansIdMap.get(activeAnswerId)];
    const graph = { nodes: [], edges: [] };

    // We could loop through the qNodes to find out what nodes are in this answer
    // But there might be extra nodes or edges in this answer
    // This happens with literature edges, they aren't in qgraph but they are in answers
    const nodeBindingsMap = new Map(Object.entries(answer.node_bindings));
    // So we loop through the keys in node_bindings
    nodeBindingsMap.forEach((val, keyId) => {
      const newNodes = [];
      const qNode = getQgNode(keyId);
      const nodeIds = val;
      let nodes = [];
      let isSet = true;

      if (!qNode.set) {
        // if the node is not a set but is still an array
        const nodeId = Array.isArray(nodeIds) ? nodeIds[0] : nodeIds;
        nodes = [{ id: nodeId }];
        isSet = false;
        // Node is not a set
        // We will make it an array so we can follow the same code path
      } else { // we need to prune the set nodes down to a managable number
        nodeIds.forEach((nodeId) => {
          const node = { id: nodeId };
          let score = 0;
          message.knowledge_graph.edges.forEach((edge) => {
            if (nodeId === edge.source_id || nodeId === edge.target_id) {
              score += edge.publications.length;
            }
          });
          node.score = score;
          nodes.push(node);
        });
        nodes = _.reverse(_.sortBy(nodes, (n) => n.score));
        nodes = nodes.splice(0, numAgSetNodes);
      }
      nodes.forEach((node) => {
        let kgNode = getKgNode(node.id);
        // Get the type from the qNode
        if (kgNode) {
          kgNode = _.cloneDeep(kgNode);
          kgNode.type = qNode.type;
          kgNode.isSet = isSet;
          kgNode.binding = keyId;
          // level is needed for hierarchical view
          kgNode.level = idToIndMaps.qgNodeMap.get(keyId);
          newNodes.push(kgNode);
        }
      });
      newNodes.forEach((n) => graph.nodes.push(n));
    });

    const prunedAgNodeIdSet = new Set(graph.nodes.map(((n) => n.id)));

    const edgeBindingsMap = new Map(Object.entries(answer.edge_bindings));

    // Construct pruned edges
    edgeBindingsMap.forEach((kedgeIds, qedgeId) => {
      const newEdges = [];
      let edgeIds = kedgeIds;
      if (!Array.isArray(edgeIds)) {
        edgeIds = [edgeIds];
      }
      edgeIds.forEach((eId) => {
        // get kedge details
        let kgEdge = getGraphEdge(message.knowledge_graph, eId);
        // check that kedge is not pruned away
        if (kgEdge && prunedAgNodeIdSet.has(kgEdge.source_id) && prunedAgNodeIdSet.has(kgEdge.target_id)) {
          kgEdge = _.cloneDeep(kgEdge);
          kgEdge.binding = qedgeId;
          // add to newEdges
          newEdges.push(kgEdge);
        }
      });
      newEdges.forEach((e) => graph.edges.push(e));
    });

    return graph;
  }

  // get only keys that show up in every single answer
  function initializeFilterKeys() {
    // makes nested filter keys object
    // {
    //  n0: {
    //    name: {
    //      Ebola: [true, true]
    //    }
    //  },
    //  n1: {
    //    name: {
    //      LINS1: [true, true]
    //    }
    //  }
    // }
    // the arrays are [checked, available given other columns]
    const { query_graph: qg } = message;
    const tempFilterKeys = {};
    qg.nodes.forEach((qnode) => {
      const qnodeId = qnode.id;
      tempFilterKeys[qnodeId] = {};
      const qnodeFilter = tempFilterKeys[qnodeId];
      Object.keys(filter[qnodeId]).forEach((knodeId) => {
        const knode = getKgNode(knodeId);
        if (knode) {
          if (Object.keys(qnodeFilter).length === 0) {
            // we are dealing with the first node
            Object.keys(knode).forEach((propertyKey) => {
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (!keyBlacklist.includes(propertyKey)) {
                qnodeFilter[propertyKey] = {};
                qnodeFilter[propertyKey][knode[propertyKey]] = [true, true];
              }
            });
          } else {
            // we are adding a node to the existing tempFilterKeys
            Object.keys(knode).forEach((propertyKey) => {
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (!keyBlacklist.includes(propertyKey) && qnodeFilter[propertyKey]) {
                qnodeFilter[propertyKey][knode[propertyKey]] = [true, true];
              }
            });
          }
          Object.keys(qnodeFilter).forEach((propertyKey) => {
            if (!Object.keys(knode).includes(propertyKey)) {
              delete qnodeFilter[propertyKey];
            }
          });
        }
      });
    });
    setFilterKeys(tempFilterKeys);
    updateSearchedFilter(tempFilterKeys);
  }

  function initializeFilter() {
    // makes simple filter object
    // {
    //  n0:{
    //    MONDO:0005737: true
    //  },
    //  n1: {
    //    LINS1: true
    //  }
    // }
    const qNodeIds = getQNodeIds();
    qNodeIds.forEach((id) => {
      filter[id] = {};
    });
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      qNodeIds.forEach((id) => {
        if (Array.isArray(nodeBindings[id])) {
          nodeBindings[id].forEach((kNodeId) => {
            filter[id][kNodeId] = true;
          });
        } else {
          filter[id][nodeBindings[id]] = true;
        }
      });
    });
    initializeFilterKeys();
    setFilter(filter);
  }

  // update filter object given the filterKeys object
  function updateFilter() {
    const qNodeIds = getQNodeIds();
    message.results.forEach((ans) => {
      const nodeBindings = ans.node_bindings;
      qNodeIds.forEach((qnodeId) => {
        let knodeIds = nodeBindings[qnodeId];
        if (!Array.isArray(knodeIds)) {
          knodeIds = [knodeIds];
        }
        const qnodeFilter = filterKeys[qnodeId];
        let show;
        knodeIds.forEach((knodeId) => {
          const knode = getKgNode(knodeId);
          if (knode) {
            show = !Object.keys(qnodeFilter).some((propertyKey) => !qnodeFilter[propertyKey][knode[propertyKey]][0]);
            filter[qnodeId][knodeId] = show;
          }
        });
      });
    });
    setFilter(_.cloneDeep(filter));
  }

  // given a value and nodeId, either check or uncheck it
  function updateFilterKeys(qnodeId, propertyKey, propertyValue) {
    const oldValue = filterKeys[qnodeId][propertyKey][propertyValue][0];
    filterKeys[qnodeId][propertyKey][propertyValue][0] = !oldValue;
    setFilterKeys(_.cloneDeep(filterKeys));
    updateFilter();
  }

  function searchFilter(qnodeId, value) {
    // we need to make a complete copy of filterKeys
    const tempSearchedFilter = _.cloneDeep(filterKeys);
    Object.keys(filterKeys[qnodeId]).forEach((propertyKey) => {
      Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
        // if the property value doesn't include the search term, delete it from the searched filter
        if (!propertyValue.toLowerCase().includes(value.toLowerCase())) {
          delete tempSearchedFilter[qnodeId][propertyKey][propertyValue];
        }
      });
    });
    updateSearchedFilter(tempSearchedFilter);
  }

  // reset the filter and filterKeys objects back to all trues
  function reset(qnodeId) {
    Object.keys(filterKeys[qnodeId]).forEach((propertyKey) => {
      Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
        filterKeys[qnodeId][propertyKey][propertyValue][0] = true;
      });
    });
    updateSearchedFilter(_.cloneDeep(filterKeys));
    updateFilter();
  }

  // return boolean of if any properties are checked
  function isPropFiltered(propertyKey) {
    let filtered = false;
    filtered = Object.keys(propertyKey).some((propertyValue) => !propertyKey[propertyValue][0]);
    return filtered;
  }

  // check whether any properties are checked and either check or uncheck all
  function checkAll(qnodeId, propertyKey) {
    const check = isPropFiltered(filterKeys[qnodeId][propertyKey]);
    Object.keys(filterKeys[qnodeId][propertyKey]).forEach((propertyValue) => {
      filterKeys[qnodeId][propertyKey][propertyValue][0] = check;
    });
    setFilterKeys(_.cloneDeep(filterKeys));
    updateFilter();
  }

  // update react table based on filter object
  function defaultFilter(row) {
    let show = true;
    const qnodeIds = getQNodeIds();
    qnodeIds.forEach((qnodeId) => {
      row.original[qnodeId].forEach((knode) => {
        if (knode.id && !filter[qnodeId][knode.id]) {
          show = false;
          return show;
        }
      });
    });
    return show;
  }

  // check to see if whole column filter has any false values
  function isFiltered(qnodeId) {
    let filtered = false;
    if (filterKeys[qnodeId]) {
      // goes through the filterkeys until it finds one that is false
      filtered = Object.keys(filterKeys[qnodeId]).some((propertyKey) => (
        Object.keys(filterKeys[qnodeId][propertyKey]).some((propertyValue) => (
          !filterKeys[qnodeId][propertyKey][propertyValue][0]))
      ));
    }
    return filtered;
  }

  // update filterKeys object based on filter and table filtered answers
  function updateFilteredAnswers(newFilteredAnswers) {
    setFilteredAnswers(newFilteredAnswers);
    const { query_graph: qg } = message;
    qg.nodes.forEach((qnode) => {
      const qnodeId = qnode.id;
      const qnodeFilter = filterKeys[qnodeId];
      Object.keys(qnodeFilter).forEach((propertyKey) => {
        Object.keys(qnodeFilter[propertyKey]).forEach((propertyValue) => {
          qnodeFilter[propertyKey][propertyValue][1] = false;
        });
      });
    });

    newFilteredAnswers.forEach((answer) => { // loop over rows (remaining answers)
      getQNodeIds().forEach((qnodeId) => { // loop over columns (qnodes)
        answer.original[qnodeId].forEach((knode) => { // loop over knodes
          if (filter[qnodeId][knode.id]) {
            knode = getKgNode(knode.id);
            Object.keys(knode).forEach((propertyKey) => { // loop over properties belonging to knode
              propertyKey = propertyKey.replace(/ /g, '_'); // for consistency, change all spaces to underscores
              if (propertyKey in filterKeys[qnodeId]) {
                filterKeys[qnodeId][propertyKey][knode[propertyKey]][1] = true;
              }
            });
          }
        });
      });
    });
    setFilterKeys(_.cloneDeep(filterKeys));
  }

  return {
    message,
    concepts: config.concepts,
    annotatedPrunedKnowledgeGraph,
    numKgNodes: numNodes('knowledge_graph'),
    numQgNodes: numNodes('query_graph'),
    answerSetTableData,
    getDenseAnswer,
    activeAnswerGraph,
    unknownNodes,
    filter,
    initializeFilter,
    updateFilterKeys,
    searchFilter,
    reset,
    defaultFilter,
    checkAll,
    isFiltered,
    updateFilteredAnswers,
    searchedFilter,
    filteredAnswers,
  };
}
