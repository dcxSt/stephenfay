import React from "react"
import "../index.css"
import Layout from "../components/layout"

export default function Home() {
    return (
				<Layout>
						<h1>Stephen Fay</h1>
            <pquote style={{ marginTop:'-16px' }}>
                    <b>Eye color:</b> grey,<br/>
                    <b>Language of choice:</b> Python, <br/>
                    <b>Favourite math:</b> stoke's theorem, the isomorphism theorems, <br/> 
                    <b>Favourite ensemble:</b> the canonical ensemble,<br/> 
                    <b>Favourite distrubition:</b> Gibbs, <br/> 
                    <b>Favourite physics (theory):</b> Classical physics, <br/> 
                    <b>Longest breath holding record:</b> 3m + epsilon seconds, <br/> 
                    <b>Unexpected talent:</b> I play the Cello, <br/> 
                    <b>Text editor of choice:</b> vim, vscode with vim keymappings, <br/> 
                    <b>Other hobbies:</b> Jiu-Jitsu, Judo, biking, basking in the sun.<br/>
                    <br/>Currently I'm making a digital filter for 
                    radio telescopes which should help us locate
                    pulsars. The current filters (polyphase filter 
                    banks) produce sharp spikes of noise at certain 
                    frequencies, I'm trying to find a different 
                    filter that will get rid of these spikes.
										<br/><br/>
										<b>Homies</b> <br/>
										<a href="https://marleyx.com" styel={{ unerline:"none" }}>Marley</a>, 
										<a href="https://rosieyzh.github.io/" style={{ underline:"none" }}>Rosie</a>, 
										<a href="https://marcelgoh.ca/">Marcel</a>
										<br/><br/>
										<b>Self</b> <br/>
										<a href="https://curius.app/stephen-fay">curious profile</a>
                </pquote>
								<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
						</Layout>
								/* not very elegant solution for whitespace at bottom of page */
    );
}

