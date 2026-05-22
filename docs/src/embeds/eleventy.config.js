// Example apidocs configuration — referenced from the docs via data-embed.

import apidocs from "@carrotsearch/eleventy-apidocs";

// fragment-start{minimal}
export default async function (eleventyConfig) {
  return apidocs(eleventyConfig, {
    contentDir: "src/content"
  });
}
// fragment-end{minimal}

// fragment-start{with-variables}
export async function withVariables(eleventyConfig) {
  return apidocs(eleventyConfig, {
    contentDir: "src/content",
    variables: {
      VERSION: "$VERSION$",
      OWNER:   "$SITE_OWNER$"
    }
  });
}
// fragment-end{with-variables}
