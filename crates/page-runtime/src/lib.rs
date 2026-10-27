//! MVP-02 managed qualification effects. No source page is reconstructed.
use wasm_bindgen::prelude::*;
use web_sys::{Element, HtmlElement, ShadowRootInit, ShadowRootMode};

#[wasm_bindgen]
pub fn implementation_stage() -> String {
    "MVP-02".to_owned()
}

#[wasm_bindgen]
pub struct PageScope {
    style: Element,
    host: Element,
    root: HtmlElement,
}

#[wasm_bindgen]
impl PageScope {
    #[wasm_bindgen(constructor)]
    pub fn new(css: &str) -> Result<PageScope, JsValue> {
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window"))?;
        let document = window
            .document()
            .ok_or_else(|| JsValue::from_str("No document"))?;
        let body = document
            .body()
            .ok_or_else(|| JsValue::from_str("Document body is not ready"))?;
        if document
            .query_selector("[data-genesis-owned='qualification']")?
            .is_some()
        {
            return Err(JsValue::from_str("Duplicate qualification host"));
        }
        let style = document.create_element("style")?;
        style.set_attribute("data-genesis-style", "qualification")?;
        style.set_text_content(Some(css));
        let host = document.create_element("div")?;
        host.set_attribute("data-genesis-owned", "qualification")?;
        let root: HtmlElement = document.create_element("div")?.dyn_into()?;
        let shadow = host.attach_shadow(&ShadowRootInit::new(ShadowRootMode::Open))?;
        shadow.append_child(&root)?;
        // Keep ownership before checking realm CSP so a failed check also cleans up.
        let scope = PageScope { style, host, root };
        body.append_child(&scope.style)?;
        body.append_child(&scope.host)?;
        let computed = window
            .get_computed_style(&scope.host)?
            .ok_or_else(|| JsValue::from_str("No computed style"))?;
        if computed.get_property_value("--genesis-qualified")?.trim() != "ready" {
            return Err(JsValue::from_str(
                "Managed CSS did not apply under the current realm policy",
            ));
        }
        Ok(scope)
    }

    pub fn root(&self) -> HtmlElement {
        self.root.clone()
    }
    pub fn dispose(&self) {
        self.host.remove();
        self.style.remove();
    }
}

impl Drop for PageScope {
    fn drop(&mut self) {
        self.dispose();
    }
}
