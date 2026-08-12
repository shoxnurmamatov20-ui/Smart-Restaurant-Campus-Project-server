import react from '@restaurant/config/eslint/react';

/**
 * The design system is the one piece of frontend code that runs in all three
 * apps, so a defect here is a defect everywhere. It went unlinted until now
 * because the shared presets were in a format ESLint 10 cannot read.
 */
export default react;
