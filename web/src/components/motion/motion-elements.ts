import { motion } from 'motion/react';

/**
 * Static motion element components to avoid dynamic component creation during render.
 */
export const motionElements = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  li: motion.li,
  ul: motion.ul,
  ol: motion.ol,
  p: motion.p,
  span: motion.span,
  nav: motion.nav,
  header: motion.header,
  footer: motion.footer,
  aside: motion.aside,
  main: motion.main,
} as const;

export type MotionElementTag = keyof typeof motionElements;
