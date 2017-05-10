var name = 'Checks-Effects-Interaction pattern'
var desc = 'Avoid potential reentrancy bugs'
var categories = require('./categories')
var common = require('./staticAnalysisCommon')
var fcallGraph = require('./functionCallGraph')
var AbstractAst = require('./abstractAstView')

function checksEffectsInteraction () {
  this.contracts = []
  var that = this

  checksEffectsInteraction.prototype.visit = new AbstractAst().builder(
    (node) => common.isInteraction(node) || common.isEffect(node) || common.isLocalCallGraphRelevantNode(node),
    that.contracts
  )
}

checksEffectsInteraction.prototype.report = function (compilationResults) {
  var warnings = []
  var hasModifiers = this.contracts.some((item) => item.modifiers.length > 0)

  var callGraph = fcallGraph.buildGlobalFuncCallGraph(this.contracts)

  this.contracts.forEach((contract) => {
    contract.functions.forEach((func) => {
      func.changesState = checkIfChangesState(common.getFullQuallyfiedFuncDefinitionIdent(contract.node, func.node, func.parameters),
                                                                                  getContext(callGraph, contract, func))
    })

    contract.functions.forEach((func) => {
      if (isPotentialVulnerableFunction(func, getContext(callGraph, contract, func))) {
        var funcName = common.getFullQuallyfiedFuncDefinitionIdent(contract.node, func.node, func.parameters)
        var comments = (hasModifiers) ? '<br/><i>Note:</i>Modifiers are currently not considered by the this static analysis.' : ''
        warnings.push({
          warning: `Potential Violation of Checks-Effects-Interaction pattern in <i>${funcName}</i>: Could potentially lead to re-entrancy vulnerability.${comments}`,
          location: func.src,
          more: 'http://solidity.readthedocs.io/en/develop/security-considerations.html#re-entrancy'
        })
      }
    })
  })

  return warnings
}

function getContext (callGraph, currentContract, func) {
  return { callGraph: callGraph, currentContract: currentContract, stateVariables: getStateVariables(currentContract, func) }
}

function getStateVariables (contract, func) {
  return contract.stateVariables.concat(func.localVariables.filter(common.isStorageVariableDeclaration))
}

function isPotentialVulnerableFunction (func, context) {
  var isPotentialVulnerable = false
  var interaction = false
  func.relevantNodes.forEach((node) => {
    if (common.isInteraction(node)) {
      interaction = true
    } else if (interaction && (common.isWriteOnStateVariable(node, context.stateVariables) || isLocalCallWithStateChange(node, context))) {
      isPotentialVulnerable = true
    }
  })
  return isPotentialVulnerable
}

function isLocalCallWithStateChange (node, context) {
  if (common.isLocalCallGraphRelevantNode(node)) {
    var func = fcallGraph.resolveCallGraphSymbol(context.callGraph, common.getFullQualifiedFunctionCallIdent(context.currentContract.node, node))
    return !func || (func && func.node.changesState)
  }
  return false
}

function checkIfChangesState (startFuncName, context) {
  return fcallGraph.analyseCallGraph(context.callGraph, startFuncName, context, (node, context) => common.isWriteOnStateVariable(node, context.stateVariables))
}

module.exports = {
  name: name,
  description: desc,
  category: categories.SECURITY,
  Module: checksEffectsInteraction
}
