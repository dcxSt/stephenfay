module.exports = {
  siteMetadata: {
    title: "gatsby-personal",
  },
  plugins: [
		{
			resolve:"gatsby-plugin-disqus",
			options:{
				shortname:"stephenfay"
			}
		},
		{
			resolve:"gatsby-plugin-verify-brave",
			options: {
				token: "8fb44f2b1e685b7959e283a41431f2e9dfa9e607fce814f396b7e1aa8ba20200",
				domain: "stephenfay.xyz",
			},
		},
    "gatsby-plugin-image",
    {
      resolve: "gatsby-plugin-manifest",
      options: {
        icon: "src/images/icon.png",
      },
    },
    "gatsby-transformer-remark",
    "gatsby-plugin-sharp",
    "gatsby-transformer-sharp",

    {
      resolve: "gatsby-plugin-mdx",
      options: {
        gatsbyRemarkPlugins: [
          {
            resolve: "gatsby-remark-images",
            options: {
              maxWidth: 1200,
            },
          },
        ],
      },
    },

    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "images",
        path: "./src/images/",
      },
      __key: "images",
    },
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "src",
        path: "./src/",
      },
    },
  ],
};
