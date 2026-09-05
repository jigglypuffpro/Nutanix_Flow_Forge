class ConditionalExecutor {
  /**
   * Evaluates a conditional expression string.
   * e.g., "{{step.exitCode}} == 0"
   */
  static evaluate(conditionString, context) {
    if (!conditionString) return true;

    // Resolve templates in the condition
    const resolvedCondition = context.resolve(conditionString);

    // Basic parser for "left operator right"
    const match = resolvedCondition.match(/(.*?)\s+(==|!=|>|<|>=|<=|contains)\s+(.*)/);
    
    if (!match) {
        // Fallback to basic truthiness if no operator
        return !!resolvedCondition && resolvedCondition !== 'false' && resolvedCondition !== '0';
    }

    let left = match[1].trim();
    const operator = match[2];
    let right = match[3].trim();

    // Type coercion helpers
    const parseValue = (val) => {
        if (!isNaN(val) && val !== '') return Number(val);
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (val === 'null') return null;
        if (val === 'undefined') return undefined;
        // strip quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            return val.substring(1, val.length - 1);
        }
        return val;
    };

    left = parseValue(left);
    right = parseValue(right);

    switch (operator) {
      case '==': return left == right; // allow coercion
      case '!=': return left != right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case 'contains': 
          if (typeof left === 'string' || Array.isArray(left)) {
              return left.includes(right);
          }
          return false;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }
}

export default ConditionalExecutor;
