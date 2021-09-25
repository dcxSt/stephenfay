import React from "react"
import { graphql } from "gatsby"
import Layout from "../components/layout"
/* import Sidenav from "../components/sidebar"
import Flynav from "../components/flybar"*/
import { Link } from "gatsby"

export default function Hidden({ data }) {
    console.log(data);
    return (
				<Layout>
                <h1>Writing</h1>
                {data.allMarkdownRemark.edges.map(({ node }) => {
                    if (node.fileAbsolutePath.includes('hidden'))
                        return (
                            <div key={node.id}>
                                <Link to={node.fields.slug} style={{ color:"inherit",textDectoration:"none",textDecorationLine:"none"}}><h4>{node.frontmatter.title} <span style={{color:"#777"}}> type : {node.frontmatter.type}</span></h4></Link>
                                {node.excerpt}
                            </div>
                        )
                        // seems to order by date by default!
                })}
        </Layout>
    );
}

export const query = graphql`
    query {
        allMarkdownRemark (sort: { fields: [frontmatter___date], order:DESC}) {
            edges {
            node {
                id
                excerpt
                frontmatter {
                    title
                    date
                    type
                }
                fileAbsolutePath
                timeToRead
                fields {
                    slug
                }
            }
            }
        }
    }
`
