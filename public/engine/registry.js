/* engine/registry.js — assembles the WHEEL_TYPES registry from the type modules.
   Add a new type = one module in ./types/ + one line here. */
import { simple } from './types/simple.js';
import { topicgroup } from './types/topicgroup.js';
import { groupdiv } from './types/groupdiv.js';

export const WHEEL_TYPES = { simple, topicgroup, groupdiv };
