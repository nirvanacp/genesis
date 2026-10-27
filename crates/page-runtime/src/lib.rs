//! Build qualification export only. DOM runtime and injection start in MVP-02.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn implementation_stage() -> String {
    "MVP-01: page customization unavailable".to_owned()
}
