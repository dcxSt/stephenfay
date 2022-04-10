import React from "react"
import { graphql } from "gatsby"
import Layout from "../components/layout"
import { Link } from "gatsby"

export default function Notes({ data }) {
    return (
				<Layout>
                <h1>Notes</h1>
                <p>These are a few notes I take in my private journal which I've selected and decided to share publically. The content here is even less of a "finished product" as in /writing.</p><br/>
                {data.allMarkdownRemark.edges.map(({ node }) => {
                    if (node.fileAbsolutePath.includes('notes'))
                        return (
                            <div key={node.id}>
                                <Link to={node.fields.slug} style={{ color:"inherit",textDectoration:"none",textDecorationLine:"none"}}><h4>{node.frontmatter.title} <span style={{color:"#777"}}>{node.frontmatter.date}</span></h4></Link>
                                {node.excerpt}
                            </div>
                        )
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
